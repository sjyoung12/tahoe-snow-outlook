// One-off: record Open-Meteo deterministic responses for offline development (retry pass).
import { writeFile, mkdir } from "node:fs/promises";
const L = [[38.935,-119.94,2590],[39.264,-120.13,2316],[38.684,-120.065,2682],[39.316,-120.326,2206],[39.262,-120.058,2194],[38.8125,-120.0336,2250],[38.664,-120.086,2440]];
await mkdir("diag/samples2", { recursive: true });
const log = {};
const lat = L.map(x => x[0]).join(","), lon = L.map(x => x[1]).join(","), el = L.map(x => x[2]).join(",");
const base = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&elevation=${el}&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FLos_Angeles&forecast_days=15`;
const reqs = {
  om_best: base + "&daily=temperature_2m_max,temperature_2m_min,snowfall_sum,rain_sum,precipitation_probability_max,wind_gusts_10m_max,wind_direction_10m_dominant&hourly=cloud_cover,wind_gusts_10m,snowfall,temperature_2m",
  om_ecmwf: base + "&hourly=snowfall,precipitation,temperature_2m&models=ecmwf_ifs025",
};
for (const [name, url] of Object.entries(reqs)) {
  for (let a = 1; a <= 4; a++) {
    const t = Date.now();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
      const body = await r.text();
      (log[name] ||= []).push({ attempt: a, status: r.status, ms: Date.now() - t, bytes: body.length });
      if (r.ok) { await writeFile(`diag/samples2/${name}.json`, body); break; }
    } catch (e) { (log[name] ||= []).push({ attempt: a, err: String(e), cause: String(e.cause?.code || e.cause || ""), ms: Date.now() - t }); }
    await new Promise(r => setTimeout(r, 8000));
  }
}
await writeFile("diag/samples2/_log.json", JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
