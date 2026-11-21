// Fetches the Open-Meteo forecast and saves it as forecast.json, the page's
// backup copy for when a viewer can't reach Open-Meteo directly.
// Run by .github/workflows/refresh-forecast.yml. Node 22+.
import { writeFile } from "node:fs/promises";
import { RESORTS, PASSES, liveURL, shapeLive } from "../forecast.js";

const ATTEMPTS = 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Errors are also printed as GitHub annotations, which show on the run's
// summary page without opening the logs.
function fail(message) {
  console.error(message);
  console.log(`::error title=Fetch forecast::${message.replace(/\r?\n/g, " ")}`);
  process.exit(1);
}

async function fetchForecast() {
  let lastError = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(liveURL(), { signal: AbortSignal.timeout(30000) });
      const body = await res.text();
      if (res.ok) return JSON.parse(body);
      lastError = `Open-Meteo returned HTTP ${res.status}: ${body.slice(0, 300)}`;
      // 4xx other than rate limiting won't fix itself on retry
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
    } catch (e) {
      lastError = `Request to Open-Meteo failed: ${e.cause?.code || e.name}: ${e.cause?.message || e.message}`;
    }
    console.warn(`Attempt ${attempt} of ${ATTEMPTS}: ${lastError}`);
    if (attempt < ATTEMPTS) await sleep(attempt * 10000);
  }
  fail(lastError);
}

const json = await fetchForecast();
const arr = Array.isArray(json) ? json : [json];
if (arr.length !== RESORTS.length + PASSES.length) {
  fail(`Expected ${RESORTS.length + PASSES.length} locations from Open-Meteo, got ${arr.length}`);
}

let data;
try { data = shapeLive(arr); }
catch (e) { fail(`Could not process the forecast: ${e.message}`); }

await writeFile(new URL("../forecast.json", import.meta.url), JSON.stringify(data) + "\n");
console.log(`Saved forecast for ${data.days[0]} to ${data.days.at(-1)}, fetched ${data.fetched}`);
