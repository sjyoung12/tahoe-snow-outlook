// Fetches the Open-Meteo forecast and saves it as forecast.json, the page's
// backup copy for when a viewer can't reach Open-Meteo directly.
// Run by .github/workflows/refresh-forecast.yml. Node 20+.
import { writeFile } from "node:fs/promises";
import { RESORTS, PASSES, liveURL, shapeLive } from "../forecast.js";

const res = await fetch(liveURL(), { signal: AbortSignal.timeout(30000) });
if (!res.ok) {
  console.error(`Open-Meteo returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const json = await res.json();
const arr = Array.isArray(json) ? json : [json];
if (arr.length !== RESORTS.length + PASSES.length) {
  console.error(`Expected ${RESORTS.length + PASSES.length} locations, got ${arr.length}`);
  process.exit(1);
}

const data = shapeLive(arr);
await writeFile(new URL("../forecast.json", import.meta.url), JSON.stringify(data) + "\n");
console.log(`Saved forecast for ${data.days[0]} to ${data.days.at(-1)}, fetched ${data.fetched}`);
