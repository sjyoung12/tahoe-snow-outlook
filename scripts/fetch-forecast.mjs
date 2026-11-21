// Builds the forecast (NWS + ECMWF ensemble + Open-Meteo weather) and saves it as forecast.json,
// the page's backup copy for when a viewer can't reach the live sources.
// Run by .github/workflows/refresh-forecast.yml. Node 22+.
import { writeFile } from "node:fs/promises";
import { buildForecast } from "../forecast.js";

const ATTEMPTS = 3;
const NWS_HEADERS = {
  // The NWS asks API clients to identify themselves
  "User-Agent": "tahoe-snow-outlook (https://github.com/sjyoung12/tahoe-snow-outlook)",
  Accept: "application/geo+json"
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const annotate = (level, message) => console.log(`::${level} title=Fetch forecast::${message.replace(/\r?\n/g, " ")}`);

// Retries network errors, rate limits and server errors; other 4xx responses fail at once.
async function getJSON(url, kind) {
  const host = new URL(url).host;
  let lastError = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: kind === "nws" ? NWS_HEADERS : {}, signal: AbortSignal.timeout(30000) });
      const body = await res.text();
      if (res.ok) return JSON.parse(body);
      lastError = `${host} returned HTTP ${res.status}: ${body.slice(0, 200)}`;
      if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
    } catch (e) {
      lastError = `${host} request failed: ${e.cause?.code || e.name}: ${e.cause?.message || e.message}`;
    }
    console.warn(`Attempt ${attempt} of ${ATTEMPTS}: ${lastError}`);
    if (attempt < ATTEMPTS) await sleep(attempt * 10000);
  }
  throw new Error(lastError);
}

let data;
try {
  data = await buildForecast(getJSON);
} catch (e) {
  annotate("error", `Could not build the forecast: ${e.message}`);
  process.exit(1);
}

// Parts that fell back to another source still produce a forecast, so they're warnings, not failures
for (const w of data.warnings) annotate("warning", w);
delete data.warnings;

await writeFile(new URL("../forecast.json", import.meta.url), JSON.stringify(data) + "\n");
const sources = [...new Set(Object.values(data.r).flatMap(r => r.src))].join(", ");
console.log(`Saved forecast for ${data.days[0]} to ${data.days.at(-1)} (sources: ${sources}), fetched ${data.fetched}`);
