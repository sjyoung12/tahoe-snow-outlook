# Tahoe Snow Outlook

A single-page 15-day outlook for Heavenly, Northstar and Kirkwood: daily snowfall, snow that falls before first chair, high and low temperature, sky during lift hours, gusts (with a "holds likely" flag at 30 mph and up), and a "chains likely / possible" flag for the drive.

The page fetches fresh data from [Open-Meteo](https://open-meteo.com/) every time it loads, in the browser, with no server or API key. If that request fails, it falls back to a snapshot built into the page, and the status chip says "Snapshot" instead of "Live".

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

Everything is in `index.html`. Resorts and passes (coordinates, elevations, routes) are the `RESORTS` and `PASSES` arrays at the top of the script.

Weather data by [Open-Meteo.com](https://open-meteo.com/), licensed CC BY 4.0.
