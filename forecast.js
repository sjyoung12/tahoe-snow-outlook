/* Shared by the page (index.html) and the hourly refresh job (scripts/fetch-forecast.mjs).

   Snowfall comes from the best source available for each day:
     1. National Weather Service gridded forecast, for the days it fully covers (about the next 7).
        Meteorologists edit a blend of many models on a 2.5 km grid, with their own snow ratios.
     2. ECMWF ensemble (51 runs) after that. Each day shows the average across runs, because the runs disagree on
        timing and a day's middle run is often zero even when most runs bring a storm that week. Totals show the
        middle half of the runs' totals as a range.
     3. A single model run if neither is available (ECMWF, then Open-Meteo's best match).
   Model snowfall is converted with a temperature-based snow ratio instead of Open-Meteo's fixed 7:1.
   Temperature, sky, wind and precip chance stay on Open-Meteo's best-match forecast. */

export const DATA_VERSION = 2;
export const TZ = "America/Los_Angeles";
export const DAYS = 15;
export const OUTLOOK_FROM = 7; // index of day 8; forecast skill drops off past about a week

export const RESORTS = [
  {id:"heavenly", name:"Heavenly", lat:38.935, lon:-119.94, elev:2590, nws:"REV/36,81", color:"--s1", note:"South Shore, east side", route:"US-50 over Echo Summit", passes:["echo"]},
  {id:"northstar", name:"Northstar", lat:39.264, lon:-120.13, elev:2316, nws:"REV/32,96", color:"--s2", note:"North Lake, Truckee side", route:"I-80 over Donner Summit, then SR-267", passes:["donner","brockway"]},
  {id:"kirkwood", name:"Kirkwood", lat:38.684, lon:-120.065, elev:2682, nws:"STO/91,63", color:"--s3", note:"Carson Pass, Sierra crest", route:"SR-88 over Carson Spur", passes:["carson"]}
];
/* Highest point on the usual Bay Area approach to each resort */
export const PASSES = [
  {id:"donner", name:"I-80 Donner Summit", lat:39.316, lon:-120.326, elev:2206, nws:"STO/88,93"},
  {id:"brockway", name:"SR-267 Brockway Summit", lat:39.262, lon:-120.058, elev:2194, nws:"REV/34,96"},
  {id:"echo", name:"US-50 Echo Summit", lat:38.8125, lon:-120.0336, elev:2250, nws:"STO/93,69"},
  {id:"carson", name:"SR-88 Carson Spur", lat:38.664, lon:-120.086, elev:2440, nws:"STO/90,63"}
];
export const LOCS = [...RESORTS, ...PASSES];
// The "nws" grid cells came from https://api.weather.gov/points/<lat>,<lon>; if one stops working,
// the builder looks it up again.

/* Snow-to-liquid ratio by air temperature (°F) at the forecast point, used for model snowfall.
   Open-Meteo assumes 7:1 everywhere. Sierra snow runs about 10:1 near freezing and fluffier in colder air. */
export const SNOW_RATIO = [[33, 8], [30, 10], [26, 12], [20, 14], [-Infinity, 16]];
export const snowRatio = tF => (tF == null || Number.isNaN(tF)) ? 10 : SNOW_RATIO.find(([t]) => tF >= t)[1];
const OM_RATIO = 7; // Open-Meteo snowfall = liquid × 7

/* ---------- requests ---------- */
const qs = o => new URLSearchParams(o).toString();
const coords = list => ({latitude:list.map(l=>l.lat).join(","), longitude:list.map(l=>l.lon).join(","), elevation:list.map(l=>l.elev).join(",")});
const COMMON = {temperature_unit:"fahrenheit", wind_speed_unit:"mph", precipitation_unit:"inch", timezone:TZ, forecast_days:String(DAYS)};
export const URLS = {
  weather: () => "https://api.open-meteo.com/v1/forecast?" + qs({...coords(LOCS), ...COMMON,
    daily:"temperature_2m_max,temperature_2m_min,rain_sum,precipitation_probability_max,wind_gusts_10m_max,wind_direction_10m_dominant",
    hourly:"cloud_cover,wind_gusts_10m,snowfall,temperature_2m"}),
  ecmwf: () => "https://api.open-meteo.com/v1/forecast?" + qs({...coords(LOCS), ...COMMON, hourly:"snowfall,temperature_2m", models:"ecmwf_ifs025"}),
  ensemble: () => "https://ensemble-api.open-meteo.com/v1/ensemble?" + qs({...coords(RESORTS), ...COMMON, daily:"snowfall_sum,temperature_2m_mean", models:"ecmwf_ifs025"}),
  nwsGrid: l => `https://api.weather.gov/gridpoints/${l.nws}`,
  nwsPoint: l => `https://api.weather.gov/points/${l.lat},${l.lon}`
};

/* ---------- time: every hourly series is keyed "YYYY-MM-DDTHH" in Pacific time ---------- */
const PT = new Intl.DateTimeFormat("en-US", {timeZone:TZ, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", hourCycle:"h23"});
export function ptKey(ms){
  const p = {}; for(const x of PT.formatToParts(ms)) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}T${p.hour}`;
}
const hh = h => String(h).padStart(2, "0");
const keysFor = (day, from, to) => { const k = []; for(let h = from; h < to; h++) k.push(`${day}T${hh(h)}`); return k; };
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const asArr = x => Array.isArray(x) ? x : [x];

/* ---------- NWS ---------- */
function hoursOf(dur){
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:\d+M)?)?$/.exec(dur || "");
  return m ? Math.max(1, (+(m[1] || 0)) * 24 + (+(m[2] || 0))) : 1;
}
const lenToIn = u => u === "wmoUnit:cm" ? v => v / 2.54 : u === "wmoUnit:m" ? v => v / 0.0254 : v => v / 25.4;
const tempToF = u => u === "wmoUnit:degF" ? v => v : v => v * 9 / 5 + 32;
// Spread each forecast period over its hours: totals are divided evenly, temperatures repeated.
function nwsHourly(layer, conv, accumulate){
  const out = new Map();
  for(const {validTime, value} of layer?.values || []){
    const [start, dur] = validTime.split("/"), n = hoursOf(dur), t0 = Date.parse(start);
    if(value == null && !accumulate) continue;
    for(let h = 0; h < n; h++) out.set(ptKey(t0 + h * 36e5), accumulate ? conv(value || 0) / n : conv(value));
  }
  return out;
}
function parseNws(grid){
  const p = grid?.properties;
  if(!p?.snowfallAmount?.values?.length) return null;
  return {
    snow: nwsHourly(p.snowfallAmount, lenToIn(p.snowfallAmount.uom), true),
    temp: nwsHourly(p.temperature, tempToF(p.temperature?.uom), false),
    updated: p.updateTime
  };
}

/* ---------- Open-Meteo hourly, with snowfall re-ratioed by temperature ---------- */
function modelHourly(loc){
  const h = loc?.hourly;
  if(!h?.time) return null;
  const snow = new Map(), temp = new Map();
  h.time.forEach((t, i) => {
    const k = t.slice(0, 13), tf = h.temperature_2m?.[i], s = h.snowfall?.[i];
    if(tf != null) temp.set(k, tf);
    if(s != null) snow.set(k, s / OM_RATIO * snowRatio(tf));
  });
  return {snow, temp};
}

/* ---------- stats ---------- */
function quantile(sorted, q){
  if(!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
// [25th percentile, average, 75th percentile]
const band = vals => { const s = [...vals].sort((a, b) => a - b); return [r1(quantile(s, .25)), r1(s.reduce((a, b) => a + b, 0) / s.length), r1(quantile(s, .75))]; };

/* ---------- build ---------- */
/* getJSON(url, kind) resolves to parsed JSON or throws; kind is "open-meteo" or "nws".
   Only the Open-Meteo weather request is required; everything else degrades to the next source. */
export async function buildForecast(getJSON, {now = Date.now()} = {}){
  const warnings = [];
  const soft = (promise, what) => promise.catch(e => { warnings.push(`${what}: ${e?.message || e}`); return null; });
  const nwsFor = l => getJSON(URLS.nwsGrid(l), "nws").catch(async () => {
    const pt = await getJSON(URLS.nwsPoint(l), "nws");
    return getJSON(pt.properties.forecastGridData, "nws");
  });

  const [weatherRaw, ecmwfRaw, ensRaw, nwsRaw] = await Promise.all([
    getJSON(URLS.weather(), "open-meteo"),
    soft(getJSON(URLS.ecmwf(), "open-meteo"), "ECMWF model"),
    soft(getJSON(URLS.ensemble(), "open-meteo"), "ECMWF ensemble"),
    Promise.all(LOCS.map(l => soft(nwsFor(l), `NWS ${l.name}`)))
  ]);
  const weather = asArr(weatherRaw), ecmwf = ecmwfRaw ? asArr(ecmwfRaw) : [], ens = ensRaw ? asArr(ensRaw) : [];
  const days = weather[0].daily.time.slice(0, DAYS);
  const nowKey = ptKey(now), today = nowKey.slice(0, 10), nowHour = +nowKey.slice(11, 13);

  // Per location: hourly snow and temperature, preferring NWS hour by hour, then ECMWF, then best match
  const hourly = LOCS.map((l, k) => {
    const nws = parseNws(nwsRaw[k]);
    if(!nws && !warnings.some(w => w.includes(l.name))) warnings.push(`NWS ${l.name}: no snowfall data`);
    const ec = modelHourly(ecmwf[k]), bm = modelHourly(weather[k]);
    const modelSnow = key => ec?.snow.has(key) ? ec.snow.get(key) : (bm?.snow.get(key) ?? 0);
    const modelTemp = key => ec?.temp.get(key) ?? bm?.temp.get(key);
    return {
      nws,
      nwsCovers: (day, from = 0) => !!nws && keysFor(day, from, 24).every(key => nws.snow.has(key)),
      snowAt: key => nws?.snow.has(key) ? nws.snow.get(key) : modelSnow(key),
      tempAt: key => nws?.temp.get(key) ?? modelTemp(key),
      modelSnow
    };
  });
  const sumKeys = (keys, f) => keys.reduce((s, key) => s + f(key), 0);

  // Ensemble members per resort: snow[member][day], re-ratioed by that member's daily mean temperature
  const members = RESORTS.map((R, k) => {
    const d = ens[k]?.daily;
    if(!d) return null;
    const suffixes = Object.keys(d).filter(key => key.startsWith("snowfall_sum")).map(key => key.slice("snowfall_sum".length));
    return suffixes.map(sfx => days.map((_, i) => {
      const s = d["snowfall_sum" + sfx]?.[i], t = d["temperature_2m_mean" + sfx]?.[i];
      return s == null ? null : s / OM_RATIO * snowRatio(t);
    }));
  });

  const r = {}, p = {};
  RESORTS.forEach((R, k) => {
    const H = hourly[k], W = weather[k], D = W.daily, M = members[k];
    const snow = [], lo = [], hi = [], src = [], ovn = [], cl = [], gl = [];
    const wh = W.hourly, idxByDay = {};
    wh.time.forEach((t, i) => { (idxByDay[t.slice(0, 10)] ||= []).push(i); });

    days.forEach((day, i) => {
      const from = day === today ? nowHour : 0;
      const memberVals = M ? M.map(m => m[i]).filter(v => v != null) : [];
      if(H.nwsCovers(day, from)){
        const v = r2(sumKeys(keysFor(day, from, 24), H.snowAt));
        snow.push(v); lo.push(v); hi.push(v); src.push("nws");
      } else if(M && memberVals.length >= M.length / 2){
        // Daily spread is very skewed (most runs dry, a few big), so the day's upper value is the 90th percentile
        const sorted = [...memberVals].sort((a, b) => a - b), avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
        snow.push(r2(avg)); lo.push(r1(quantile(sorted, .1))); hi.push(r1(quantile(sorted, .9))); src.push("ens");
      } else {
        const v = r2(sumKeys(keysFor(day, 0, 24), H.modelSnow));
        snow.push(v); lo.push(v); hi.push(v); src.push("model");
      }
      // First chair: 4 PM the day before to 9 AM. Not shown for ensemble outlook days, which have no hourly timing.
      if(src[i] === "ens" && i >= OUTLOOK_FROM) ovn.push(null);
      else ovn.push(r1(sumKeys([...(i > 0 ? keysFor(days[i - 1], 16, 24) : []), ...keysFor(day, 0, 9)], H.snowAt)));
      // Sky and gusts over lift hours, 9 AM to 4 PM
      const lift = (idxByDay[day] || []).filter(j => { const h = +wh.time[j].slice(11, 13); return h >= 9 && h < 16; });
      cl.push(Math.round(lift.reduce((s, j) => s + (wh.cloud_cover[j] || 0), 0) / Math.max(lift.length, 1)));
      gl.push(Math.round(Math.max(0, ...lift.map(j => wh.wind_gusts_10m[j] || 0))));
    });

    // Totals: NWS and model days are fixed; ensemble days vary by run. The middle value is the average, so it equals
    // the sum of the daily bars; the range is the middle half of the runs' totals.
    const total = (a, b) => {
      const fixed = days.slice(a, b).reduce((s, _, j) => s + (src[a + j] === "ens" ? 0 : snow[a + j]), 0);
      const ensDays = days.map((_, i) => i).slice(a, b).filter(i => src[i] === "ens");
      if(!ensDays.length) { const v = r1(fixed); return [v, v, v]; }
      return band(M.map(m => fixed + ensDays.reduce((s, i) => s + (m[i] ?? snow[i]), 0)));
    };

    r[R.id] = {
      snow, lo, hi, src, ovn, cl, gl,
      rain: D.rain_sum.slice(0, DAYS).map(v => r2(v || 0)),
      tmax: D.temperature_2m_max.slice(0, DAYS).map(Math.round), tmin: D.temperature_2m_min.slice(0, DAYS).map(Math.round),
      pp: D.precipitation_probability_max.slice(0, DAYS).map(v => v ?? 0),
      wg: D.wind_gusts_10m_max.slice(0, DAYS).map(Math.round), wd: D.wind_direction_10m_dominant.slice(0, DAYS),
      tot: {all: total(0, DAYS), wk: total(0, OUTLOOK_FROM), later: total(OUTLOOK_FROM, DAYS)},
      nwsUpdated: H.nws?.updated || null
    };
  });

  // Passes: snow and coldest temperature in each driving window, hour by hour from the best source
  PASSES.forEach((P, j) => {
    const H = hourly[RESORTS.length + j], o = {pre:[], am:[], pm:[], amT:[], pmT:[], src:[]};
    days.forEach((day, i) => {
      const S = keys => r1(sumKeys(keys, H.snowAt));
      const T = keys => { const t = keys.map(H.tempAt).filter(v => v != null); return t.length ? Math.round(Math.min(...t)) : null; };
      const am = keysFor(day, 5, 11), pm = keysFor(day, 14, 20);
      o.pre.push(S([...(i > 0 ? keysFor(days[i - 1], 20, 24) : []), ...keysFor(day, 0, 5)]));
      o.am.push(S(am)); o.pm.push(S(pm)); o.amT.push(T(am)); o.pmT.push(T(pm));
      o.src.push(H.nwsCovers(day) ? "nws" : "model");
    });
    p[P.id] = o;
  });

  return {v: DATA_VERSION, fetched: new Date(now).toISOString(), days, r, p, warnings};
}
