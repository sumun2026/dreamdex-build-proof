import fs from "node:fs";
const BASES = ["https://stg.api.dreamdex.io/v0", "https://api.dreamdex.io/v0"];

async function get(base, path) {
  try {
    const r = await fetch(base + path, { headers: { accept: "application/json" } });
    const t = await r.text();
    return { status: r.status, body: t };
  } catch (e) {
    return { status: "ERR", body: String(e) };
  }
}
const count = (t) => {
  try {
    const j = JSON.parse(t);
    const a = Array.isArray(j) ? j : j.orderbooks || j.tickers || j.markets || j.currencies || [];
    return `len=${Array.isArray(a) ? a.length : "?"}`;
  } catch {
    return "";
  }
};
const line = (label, res) =>
  `  ${String(res.status).padEnd(4)} ${label.padEnd(44)} ${count(res.body)}  ${res.body.slice(0, 150)}`;

const out = {};
for (const base of BASES) {
  const L = [`\n######## ${base}   (captured ${new Date().toISOString()})`];
  L.push("--- documented curl examples, run verbatim");
  L.push(line('orderbooks CORRECT repeated keys', await get(base, "/orderbooks?symbols=SOMI:USDso&symbols=WETH:USDso")));
  L.push(line('orderbooks WRONG comma (docs predict [])', await get(base, "/orderbooks?symbols=SOMI:USDso,WETH:USDso")));
  L.push(line('tickers comma (same rule claims to apply)', await get(base, "/tickers?symbols=SOMI:USDso,WETH:USDso")));
  L.push(line('tickers repeated keys', await get(base, "/tickers?symbols=SOMI:USDso&symbols=WETH:USDso")));
  L.push("--- documented 404 paths");
  L.push(line('GET /markets/SOMI:USDso/orderbook (docs: 404)', await get(base, "/markets/SOMI:USDso/orderbook")));
  L.push(line('GET /orderbooks/SOMI:USDso (docs: 404)', await get(base, "/orderbooks/SOMI:USDso")));
  L.push("--- documented endpoints said to exist");
  L.push(line('GET /markets', await get(base, "/markets")));
  L.push(line('GET /currencies', await get(base, "/currencies")));
  L.push("--- volume: documented defaults + bounds, in MILLISECONDS");
  const nowS = Math.floor(Date.now() / 1000);
  const D = 86400000;
  const v = await get(base, "/markets/SOMI:USDso/volume");
  const j = JSON.parse(v.body);
  L.push(line(`default window (docs: until=now-30m, since=until-7d)`, v));
  L.push(`      echo span=${((j.until - j.since) / D).toFixed(4)}d  until is ${((nowS * 1000 - j.until) / 60000).toFixed(2)} min old`);
  L.push(line('exactly 40d (docs: allowed)', await get(base, `/markets/SOMI:USDso/volume?since=${(nowS - 40 * 86400) * 1000}&until=${(nowS - 1800) * 1000}`)));
  L.push(line('40d + 1s (docs: rejected)', await get(base, `/markets/SOMI:USDso/volume?since=${(nowS - 40 * 86400 - 1) * 1000}&until=${(nowS - 1800) * 1000}`)));
  L.push(line('until=now-29m (docs: rejected)', await get(base, `/markets/SOMI:USDso/volume?since=${(nowS - 86400) * 1000}&until=${(nowS - 1740) * 1000}`)));
  L.push(line('until=now-31m (docs: accepted)', await get(base, `/markets/SOMI:USDso/volume?since=${(nowS - 86400) * 1000}&until=${(nowS - 1860) * 1000}`)));
  out[base] = L.join("\n");
  console.log(out[base]);
}
fs.writeFileSync("probe-verbatim.json", JSON.stringify(out, null, 2));
