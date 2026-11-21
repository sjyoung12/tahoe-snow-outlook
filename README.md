# Tahoe Snow Outlook

A single-page 15-day outlook for Heavenly, Northstar and Kirkwood: daily snowfall, snow that falls before first chair, high and low temperature, sky during lift hours, gusts (with a "holds likely" flag at 30 mph and up), and a "chains likely / possible" flag for the drive.

The page fetches fresh data from [Open-Meteo](https://open-meteo.com/) every time it loads, in the browser, with no server or API key. Some networks can't reach Open-Meteo's API, so the page has two fallbacks, used in this order:

1. **`forecast.json`**, an hourly copy saved to this repo by the `Refresh forecast copy` workflow (`.github/workflows/refresh-forecast.yml`, running `scripts/fetch-forecast.mjs`). It's triggered hourly from cron-job.org, with a GitHub schedule as a best-effort backup.
2. **A snapshot built into `index.html`**, for when even that file is missing.

The status chip says which one you're seeing and how old it is.

Resort and pass locations, the Open-Meteo request and the data shaping live in `forecast.js`, which both the page and the refresh script import.

## How the numbers are made

- **Forecast points.** Each resort is read at one mid-mountain point: Heavenly 8,500 ft, Northstar 7,600 ft, Kirkwood 8,800 ft. Open-Meteo's `elevation` parameter adjusts temperature to that height.
- **First chair.** Snow from 4 PM the evening before to 9 AM.
- **Sky and gusts.** Averaged or maxed over lift hours, 9 AM to 4 PM.
- **Chains.** A heuristic, not Caltrans data. It reads the forecast at the highest pass on each usual Bay Area route: Echo Summit (US-50) for Heavenly, Donner Summit (I-80) and Brockway Summit (SR-267) for Northstar, Carson Spur (SR-88) for Kirkwood.
  - Likely: 0.5" or more during the drive up (5–11 AM) or home (2–8 PM), or 1" or more overnight before the drive up.
  - Possible: 0.1" or more in a driving window, or 0.3" overnight.
  - Windows warmer than 34°F don't count.
  - Thresholds live in the `CHAINS` constant in `index.html`.
- **Days 8–15** are shaded as outlook; skill drops off past about a week.

These are raw model numbers with no local correction. In big storms, global models tend to under-forecast snow on the Sierra crest.

## Editing

The page is `index.html`. Resorts and passes (coordinates, elevations, routes) are the `RESORTS` and `PASSES` arrays in `forecast.js`.

Weather data by [Open-Meteo.com](https://open-meteo.com/), licensed CC BY 4.0.
