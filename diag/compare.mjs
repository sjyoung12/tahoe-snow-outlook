// One-off diagnostic: why is our Kirkwood total so far below OpenSnow's?
import { writeFile } from "node:fs/promises";
const K = { lat: 38.684, lon: -120.065, elev: 2682 };
const out = { ran: new Date().toISOString() };
const get = async (url, opts) => { try { const r = await fetch(url, { signal: AbortSignal.timeout(30000), ...opts }); const t = await r.text(); return r.ok ? JSON.parse(t) : { http: r.status, body: t.slice(0, 300) }; } catch (e) { return { err: String(e) }; } };
const sum = a => +(a || []).reduce((s, v) => s + (v || 0), 0).toFixed(2);
const models = ["best_match","ecmwf_ifs025","ecmwf_aifs025_single","gfs_seamless","gfs_graphcast025","icon_seamless","gem_seamless","ukmo_seamless","meteofrance_seamless","jma_seamless"];

// 1. Each model: 15-day precip (in) and snowfall (in), with and without our elevation override, plus the model's own grid elevation
for (const elevParam of ["", `&elevation=${K.elev}`]) {
  const tag = elevParam ? "with_elev_2682m" : "model_terrain";
  out[tag] = {};
  for (const m of models) {
    const d = await get(`https://api.open-meteo.com/v1/forecast?latitude=${K.lat}&longitude=${K.lon}${elevParam}&daily=precipitation_sum,snowfall_sum,rain_sum&precipitation_unit=inch&timezone=America%2FLos_Angeles&forecast_days=16&models=${m}`);
    if (!d.daily) { out[tag][m] = d; continue; }
    out[tag][m] = { elev_m: d.elevation, precip_in: sum(d.daily.precipitation_sum), snow_in: sum(d.daily.snowfall_sum), rain_in: sum(d.daily.rain_sum),
      days_with_data: d.daily.precipitation_sum.filter(v => v != null).length,
      daily_precip: d.daily.precipitation_sum.map(v => v == null ? null : +v.toFixed(2)), daily_snow: d.daily.snowfall_sum.map(v => v == null ? null : +v.toFixed(1)) };
  }
}
// 2. Ensembles: spread of 15-day snowfall across members
out.ensembles = {};
for (const m of ["gfs025", "ecmwf_ifs025", "icon_seamless"]) {
  const d = await get(`https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${K.lat}&longitude=${K.lon}&elevation=${K.elev}&daily=precipitation_sum,snowfall_sum&precipitation_unit=inch&forecast_days=16&models=${m}`);
  if (!d.daily) { out.ensembles[m] = d; continue; }
  const snowKeys = Object.keys(d.daily).filter(k => k.startsWith("snowfall_sum")), pKeys = Object.keys(d.daily).filter(k => k.startsWith("precipitation_sum"));
  const st = ks => { const v = ks.map(k => sum(d.daily[k])).sort((a, b) => a - b); const q = p => v[Math.floor(p * (v.length - 1))]; return { members: v.length, min: v[0], p25: q(.25), median: q(.5), p75: q(.75), max: v.at(-1), mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) }; };
  out.ensembles[m] = { snow_in: st(snowKeys), precip_in: st(pKeys) };
}
// 3. NWS gridpoint forecast (National Blend + forecaster edits), ~7 days
const ua = { headers: { "User-Agent": "tahoe-snow-outlook diagnostic (github.com/sjyoung12/tahoe-snow-outlook)", Accept: "application/geo+json" } };
const pt = await get(`https://api.weather.gov/points/${K.lat},${K.lon}`, ua);
if (pt.properties) {
  const g = await get(pt.properties.forecastGridData, ua);
  const p = g.properties || {};
  const tot = (f, conv) => { const vals = (p[f]?.values || []); return { total: +vals.reduce((s, x) => s + (x.value || 0) * conv, 0).toFixed(2), first: vals[0]?.validTime, last: vals.at(-1)?.validTime }; };
  out.nws = { grid: `${pt.properties.gridId} ${pt.properties.gridX},${pt.properties.gridY}`, grid_elev_m: p.elevation?.value, snow_in: tot("snowfallAmount", 1 / 25.4), qpf_in: tot("quantitativePrecipitation", 1 / 25.4), snow_level_ft: (p.snowLevel?.values || []).slice(0, 12).map(x => [x.validTime.slice(0, 13), Math.round(x.value * 3.281)]) };
} else out.nws = pt;

await writeFile("diag/result.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out).slice(0, 2000));
