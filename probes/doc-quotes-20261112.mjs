import { writeFileSync } from "node:fs";
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36" };
const Q = [
  ["developers/libraries/ccxt", "SOMI/USDC"],
  ["developers/libraries/ccxt", "usdc"],
  ["developers/websocket-api/operations", "Required"],
  ["developers/http-api/error-handling", "invalid_interval"],
  ["developers/http-api/trading", "interval"],
  ["developers/http-api/market-data", "interval"],
  ["developers/http-api/market-data", "limit"],
];
const cache = new Map();
for (const [p, s] of Q) {
  if (!cache.has(p)) {
    const r = await fetch(`https://app.dreamdex.io/docs/${p}.md`, { headers: UA });
    const t = await r.text();
    cache.set(p, { status: r.status, t });
    writeFileSync(`docmd-20261112-${p.replace(/\//g, "_")}.md`, t);
  }
  const { status, t } = cache.get(p);
  console.log(`${status} ${t.includes(s) ? "PRESENT" : "ABSENT "}  ${p}.md  ::  ${s}  (${t.length} B)`);
}
const r = await fetch("https://app.dreamdex.io/docs/openapi", { headers: UA });
console.log(`\nopenapi page: HTTP ${r.status} ${(await r.text()).length} B`);
for (const u of ["https://app.dreamdex.io/openapi.json", "https://api.dreamdex.io/v0/openapi.json", "https://api.dreamdex.io/openapi.json"]) {
  try { const x = await fetch(u, { headers: UA }); const t = await x.text(); console.log(`${x.status} ${String(t.length).padStart(7)} B  ${u}`); }
  catch (e) { console.log(`ERR ${u} ${e.message}`); }
}
