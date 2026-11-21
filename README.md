# Tahoe Snow Outlook

A single-page 15-day outlook for Heavenly, Northstar and Kirkwood: daily snowfall, snow that falls before first chair, high and low temperature, sky during lift hours, gusts (with a "holds likely" flag at 30 mph and up), and a "chains likely / possible" flag for the drive.

The page builds the forecast in the browser every time it loads, with no server or API key. Some networks can't reach the forecast APIs, so the page has two fallbacks, used in this order:

1. **`forecast.json`**, an hourly copy saved to this repo by the `Refresh forecast copy` workflow (`.github/workflows/refresh-forecast.yml`, running `scripts/fetch-forecast.mjs`). It's triggered hourly from cron-job.org, with a GitHub schedule as a best-effort backup.
2. **A snapshot built into `index.html`**, for when even that file is missing.

The status chip says which one you're seeing and how old it is.

Everything about sources and data shaping lives in `forecast.js`, which both the page and the refresh script import, so the two always agree.

## Where the snow numbers come from

Each day uses the best source available, in this order:

1. **National Weather Service gridded forecast** ([api.weather.gov](https://www.weather.gov/documentation/services-web-api)), for each day it fully covers, usually the next 7. NWS meteorologists edit a blend of models on a 2.5 km grid that resolves the Sierra terrain, and apply their own snow ratios. Heavenly and Brockway Summit are in the Reno office's area; the rest are Sacramento's.
2. **ECMWF ensemble**, 51 runs, via Open-Meteo's ensemble API. Each day shows the **average** across runs, drawn as a lighter bar. The runs disagree on storm timing, so a day's middle run is often zero even when most runs bring a storm that week, and averages add up to a sensible total where medians don't. Each day also gets an "up to" figure: the 90th percentile, what 1 run in 10 exceeds.
3. **A single model run** (ECMWF, then Open-Meteo's best match) if neither of the above is available.

Model snowfall is re-ratioed by temperature at the forecast point instead of using Open-Meteo's fixed 7:1: 8:1 at 33°F and up, 10:1 at 30–32°F, 12:1 at 26–29°F, 14:1 at 20–25°F, and 16:1 below 20°F (`SNOW_RATIO` in `forecast.js`).

**Totals.** NWS days are fixed numbers; ensemble days vary by run. Each tile's big number is the average total (so it equals the sum of the daily bars), and "likely" is the middle half of the 51 runs' totals.

This mix fixes the main reasons the first version ran far below OpenSnow: it used one model run (GFS, often the driest), Open-Meteo's low 7:1 snow ratio, and a 25 km grid that flattens the crest. There's still no resort-specific correction, so big crest storms can still come in under OpenSnow's numbers.

## Other fields

- **Forecast points.** Each resort is read at one mid-mountain point: Heavenly 8,500 ft, Northstar 7,600 ft, Kirkwood 8,800 ft. Open-Meteo's `elevation` parameter adjusts temperature to that height.
- **Temperature, sky, wind, precip chance and rain** come from Open-Meteo's best-match forecast for all 15 days.
- **First chair.** Snow from 4 PM the evening before to 9 AM. Blank on ensemble outlook days, which have only daily totals.
- **Sky and gusts.** Averaged or maxed over lift hours, 9 AM to 4 PM.
- **Chains.** A heuristic, not Caltrans data. It reads snow and temperature hour by hour at the highest pass on each usual Bay Area route, from the NWS where it covers the hour and the re-ratioed ECMWF run after that: Echo Summit (US-50) for Heavenly, Donner Summit (I-80) and Brockway Summit (SR-267) for Northstar, Carson Spur (SR-88) for Kirkwood.
  - Likely: 0.5" or more during the drive up (5–11 AM) or home (2–8 PM), or 1" or more overnight before the drive up.
  - Possible: 0.1" or more in a driving window, or 0.3" overnight.
  - Windows warmer than 34°F don't count.
  - Thresholds live in the `CHAINS` constant in `index.html`.
- **Days 8–15** are shaded as outlook; skill drops off past about a week.

## Editing

The page is `index.html`. Resorts and passes (coordinates, elevations, NWS grid cells, routes) are the `RESORTS` and `PASSES` arrays in `forecast.js`. A new location's NWS grid cell comes from `https://api.weather.gov/points/<lat>,<lon>`; if a stored one stops working, the builder looks it up again.

If any source fails during the hourly refresh, the run still saves a forecast from the remaining sources and lists what fell back as warnings on the run's summary page. Only a failed Open-Meteo weather request fails the run.

Snow forecasts from the [National Weather Service](https://www.weather.gov/) and ECMWF via [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0), which also supplies the rest of the weather.
