import fs from "node:fs";
const BASES = ["https://stg.api.dreamdex.io/v0", "https://api.dreamdex.io/v0"];

async function get(base, path) {
  const url = base + path;
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    const txt = await r.text();
    return { status: r.status, ms: Date.now() - t0, body: txt };
  } catch (e) {
    return { status: "ERR", ms: Date.now() - t0, body: String(e) };
  }
}

const show = (label, res) =>
  `  ${String(res.status).padEnd(4)} ${label.padEnd(38)} ${res.body.slice(0, 220)}`;

const out = {};
for (const base of BASES) {
  const lines = [`\n######## ${base}`];
  const nowS = Math.floor(Date.now() / 1000);
  const dayS = 86400;

  lines.push("--- A. docs: 'Unknown or malformed symbols are silently skipped ... empty [] rather than a 4xx'");
  lines.push(show("orderbooks valid+garbage", await get(base, "/orderbooks?symbols=SOMI:USDso,NOPE:USDso")));
  lines.push(show("orderbooks garbage only", await get(base, "/orderbooks?symbols=NOPE:USDso")));
  lines.push(show("orderbooks malformed (no colon)", await get(base, "/orderbooks?symbols=SOMI")));
  lines.push(show("tickers valid+garbage", await get(base, "/tickers?symbols=SOMI:USDso,NOPE:USDso")));
  lines.push(show("tickers garbage only", await get(base, "/tickers?symbols=NOPE:USDso")));

  lines.push("--- B. volume: unit is undocumented; seconds vs milliseconds");
  lines.push(show("seconds 1d", await get(base, `/markets/SOMI:USDso/volume?since=${nowS - dayS}&until=${nowS - 1800}`)));
  lines.push(show("milliseconds 1d", await get(base, `/markets/SOMI:USDso/volume?since=${(nowS - dayS) * 1000}&until=${(nowS - 1800) * 1000}`)));
  lines.push(show("seconds 30d (looks like 30 min in ms)", await get(base, `/markets/SOMI:USDso/volume?since=${nowS - 30 * dayS}&until=${nowS - 1800}`)));

  lines.push("--- C. does anything sanity-check the epoch year? (1970 range)");
  lines.push(show("since=0 until=1d (Jan 1970)", await get(base, "/markets/SOMI:USDso/volume?since=0&until=86400")));
  lines.push(show("millis since=0 until=1d", await get(base, "/markets/SOMI:USDso/volume?since=0&until=86400000")));

  lines.push("--- D. validation leak on non-numeric input");
  lines.push(show("until=abc", await get(base, `/markets/SOMI:USDso/volume?since=${nowS - dayS}&until=abc`)));
  lines.push(show("since=-1", await get(base, `/markets/SOMI:USDso/volume?since=-1&until=${nowS * 1000}`)));
  lines.push(show("until float", await get(base, `/markets/SOMI:USDso/volume?since=${(nowS - dayS) * 1000}&until=1.5`)));

  out[base] = lines.join("\n");
  console.log(out[base]);
}
fs.writeFileSync("probe-confirm.json", JSON.stringify(out, null, 2));
