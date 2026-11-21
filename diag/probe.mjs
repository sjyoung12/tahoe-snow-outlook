// One-off: record real responses for offline development.
import { writeFile, mkdir } from "node:fs/promises";
const L = [["heavenly",38.935,-119.94,2590],["northstar",39.264,-120.13,2316],["kirkwood",38.684,-120.065,2682],
  ["donner",39.316,-120.326,2206],["brockway",39.262,-120.058,2194],["echo",38.8125,-120.0336,2250],["carson",38.664,-120.086,2440]];
await mkdir("diag/samples", { recursive: true });
const log = {};
async function rec(name, url, headers = {}) {
  const t = Date.now();
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
    const body = await r.text();
    log[name] = { status: r.status, ms: Date.now() - t, bytes: body.length, acao: r.headers.get("access-control-allow-origin"), ctype: r.headers.get("content-type") };
    await writeFile(`diag/samples/${name}.json`, body);
    return r.ok ? JSON.parse(body) : null;
  } catch (e) { log[name] = { err: String(e) }; return null; }
}
const lat = L.map(x => x[1]).join(","), lon = L.map(x => x[2]).join(","), el = L.map(x => x[3]).join(",");
const res3 = L.slice(0, 3);
// Ensemble: try daily with temperature mean, and alternatives
await rec("ens_daily", `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${res3.map(x=>x[1])}&longitude=${res3.map(x=>x[2])}&elevation=${res3.map(x=>x[3])}&daily=precipitation_sum,snowfall_sum,temperature_2m_mean&precipitation_unit=inch&temperature_unit=fahrenheit&timezone=America%2FLos_Angeles&forecast_days=15&models=ecmwf_ifs025`);
await rec("ens_daily_minmax", `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=38.684&longitude=-120.065&elevation=2682&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=America%2FLos_Angeles&forecast_days=15&models=ecmwf_ifs025`);
// Deterministic: best_match + ecmwf together, 7 locations
await rec("om_multi", `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&elevation=${el}&daily=temperature_2m_max,temperature_2m_min,snowfall_sum,rain_sum,precipitation_probability_max,wind_gusts_10m_max,wind_direction_10m_dominant&hourly=cloud_cover,wind_gusts_10m,snowfall,temperature_2m&models=best_match,ecmwf_ifs025&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FLos_Angeles&forecast_days=15`);
// NWS
const ua = { "User-Agent": "tahoe-snow-outlook probe (github.com/sjyoung12/tahoe-snow-outlook)", Accept: "application/geo+json", Origin: "https://sjyoung12.github.io" };
log.points = {};
for (const [id, la, lo] of L) {
  const p = await rec(`nws_points_${id}`, `https://api.weather.gov/points/${la},${lo}`, ua);
  if (p?.properties) {
    log.points[id] = `${p.properties.gridId} ${p.properties.gridX},${p.properties.gridY}`;
    await rec(`nws_grid_${id}`, p.properties.forecastGridData, ua);
  }
}
// NWS without a User-Agent of ours, like a browser would (Node still sends its own)
await rec("nws_noua_kirkwood", `https://api.weather.gov/points/38.684,-120.065`, { Origin: "https://sjyoung12.github.io" });
await writeFile("diag/samples/_log.json", JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
