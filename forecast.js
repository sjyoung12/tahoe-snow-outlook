/* Shared by the page (index.html) and the hourly refresh job (scripts/fetch-forecast.mjs). */

export const RESORTS = [
  {id:"heavenly", name:"Heavenly", lat:38.935, lon:-119.94, elev:2590, color:"--s1", note:"South Shore, east side", route:"US-50 over Echo Summit", passes:["echo"]},
  {id:"northstar", name:"Northstar", lat:39.264, lon:-120.13, elev:2316, color:"--s2", note:"North Lake, Truckee side", route:"I-80 over Donner Summit, then SR-267", passes:["donner","brockway"]},
  {id:"kirkwood", name:"Kirkwood", lat:38.684, lon:-120.065, elev:2682, color:"--s3", note:"Carson Pass, Sierra crest", route:"SR-88 over Carson Spur", passes:["carson"]}
];
/* Highest point on the usual Bay Area approach to each resort */
export const PASSES = [
  {id:"donner", name:"I-80 Donner Summit", lat:39.316, lon:-120.326, elev:2206},
  {id:"brockway", name:"SR-267 Brockway Summit", lat:39.262, lon:-120.058, elev:2194},
  {id:"echo", name:"US-50 Echo Summit", lat:38.8125, lon:-120.0336, elev:2250},
  {id:"carson", name:"SR-88 Carson Spur", lat:38.664, lon:-120.086, elev:2440}
];

export const LOCS = [...RESORTS, ...PASSES];
export function liveURL(){
  const p = new URLSearchParams({
    latitude:LOCS.map(r=>r.lat).join(","), longitude:LOCS.map(r=>r.lon).join(","), elevation:LOCS.map(r=>r.elev).join(","),
    daily:"temperature_2m_max,temperature_2m_min,snowfall_sum,rain_sum,precipitation_probability_max,wind_gusts_10m_max,wind_direction_10m_dominant",
    hourly:"cloud_cover,wind_gusts_10m,snowfall,temperature_2m",
    temperature_unit:"fahrenheit", wind_speed_unit:"mph", precipitation_unit:"inch",
    timezone:"America/Los_Angeles", forecast_days:"15"});
  return "https://api.open-meteo.com/v1/forecast?"+p;
}
export function shapeLive(arr){
  const days = arr[0].daily.time, r = {}, p = {};
  arr.slice(RESORTS.length).forEach((loc,k)=>{
    const h = loc.hourly, byDay = {}, hr = i=>+h.time[i].slice(11,13), r1 = v=>Math.round(v*10)/10;
    h.time.forEach((t,i)=>{(byDay[t.slice(0,10)] ||= []).push(i)});
    const o = {pre:[],am:[],pm:[],amT:[],pmT:[]};
    days.forEach((d,j)=>{
      const idx = byDay[d]||[], win = (a,z)=>idx.filter(i=>hr(i)>=a && hr(i)<z);
      const am = win(5,11), pm = win(14,20), prev = j>0 ? (byDay[days[j-1]]||[]).filter(i=>hr(i)>=20) : [];
      const S = a=>r1(a.reduce((s,i)=>s+(h.snowfall[i]||0),0)), T = a=>Math.round(Math.min(...a.map(i=>h.temperature_2m[i])));
      o.pre.push(S([...prev,...win(0,5)])); o.am.push(S(am)); o.pm.push(S(pm)); o.amT.push(T(am)); o.pmT.push(T(pm));
    });
    p[PASSES[k].id] = o;
  });
  arr.slice(0,RESORTS.length).forEach((loc,k)=>{
    const h = loc.hourly, D = loc.daily, byDay = {};
    h.time.forEach((t,i)=>{(byDay[t.slice(0,10)] ||= []).push(i)});
    const cl=[], gl=[], ovn=[];
    days.forEach((d,j)=>{
      const idx = byDay[d]||[], hr = i=>+h.time[i].slice(11,13);
      const lift = idx.filter(i=>hr(i)>=9 && hr(i)<16);
      cl.push(Math.round(lift.reduce((s,i)=>s+h.cloud_cover[i],0)/Math.max(lift.length,1)));
      gl.push(Math.round(Math.max(0,...lift.map(i=>h.wind_gusts_10m[i]))));
      const prev = j>0 ? (byDay[days[j-1]]||[]).filter(i=>hr(i)>=16) : [];
      const morn = idx.filter(i=>hr(i)<9);
      ovn.push(+[...prev,...morn].reduce((s,i)=>s+(h.snowfall[i]||0),0).toFixed(1));
    });
    r[RESORTS[k].id] = {snow:D.snowfall_sum, rain:D.rain_sum, tmax:D.temperature_2m_max.map(Math.round), tmin:D.temperature_2m_min.map(Math.round),
      pp:D.precipitation_probability_max, wg:D.wind_gusts_10m_max.map(Math.round), wd:D.wind_direction_10m_dominant, cl, gl, ovn};
  });
  return {fetched:new Date().toISOString(), days, r, p};
}
