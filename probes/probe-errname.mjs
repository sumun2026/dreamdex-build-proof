import fs from "node:fs";
const BASES = ["https://stg.api.dreamdex.io/v0", "https://api.dreamdex.io/v0"];

async function get(base, path) {
  const r = await fetch(base + path, { headers: { accept: "application/json" } });
  const t = await r.text();
  return { status: r.status, errName: r.headers.get("error-name"), body: t };
}
const L = [];
const out = {};
for (const base of BASES) {
  L.length = 0;
  L.push(`\n######## ${base}  error-name contract  captured ${new Date().toISOString()}`);
  for (const [label, path] of [
    ["volume unknown symbol in path", "/markets/FAKE:USDso/volume"],
    ["volume malformed symbol in path", "/markets/FAKE/volume"],
    ["volume valid symbol, bad since", "/markets/SOMI:USDso/volume?since=abc"],
    ["orderbooks unknown symbol", "/orderbooks?symbols=FAKE:USDso"],
    ["tickers unknown symbol", "/tickers?symbols=FAKE:USDso"],
    ["orderbooks no params", "/orderbooks"],
    ["tickers no params", "/tickers"],
    ["markets path 404 (known doc claim)", "/markets/SOMI:USDso/orderbook"],
  ]) {
    const r = await get(base, path);
    L.push(`  ${String(r.status).padEnd(4)} ${label.padEnd(36)} Error-Name=${String(r.errName).padEnd(18)} ${r.body.replace(/\s+/g, " ").slice(0, 130)}`);
  }
  out[base] = L.join("\n");
  console.log(out[base]);
}
fs.writeFileSync("probe-errname.json", JSON.stringify(out, null, 2));
