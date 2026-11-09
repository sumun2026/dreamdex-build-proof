// Pin the disagreement: which bar, which fields, is it deterministic, and does a THIRD endpoint
// (REST /volume for that exact UTC day) agree with /candles or with the WS snapshot?
import { request, restGet, NETWORKS } from "./rest.js";

const B = NETWORKS.mainnet.rest;
const WS = NETWORKS.mainnet.ws;
const MKT = "SOMI:USDso";

function wsSnapshot(timeframe, hardMs = 25000) {
  return new Promise((resolve) => {
    const w = new WebSocket(WS);
    let doneFlag = false;
    const finish = (v) => { if (doneFlag) return; doneFlag = true; try { w.close(); } catch { /* already closed */ } resolve(v); };
    w.onopen = () => w.send(JSON.stringify({ id: 1, operation: "subscribe", channel: "ohlcv", params: { symbol: MKT, timeframe } }));
    w.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.channel === "ohlcv" && m.type === "snapshot") finish(m.candles ?? []); };
    w.onerror = () => finish(null);
    setTimeout(() => finish(null), hardMs);
  });
}

const DAY = 86400000;
const dayLabel = (ts) => new Date(Number(ts)).toISOString().slice(0, 10);

const restRes = await request(`${B}/markets/${encodeURIComponent(MKT)}/candles?interval=1d`);
const restC = restRes.json.candles;

console.log("=== WS vs REST, every shared daily bar, field by field (run 1) ===");
const diffs = [];
const wsC1 = await wsSnapshot("1d");
const byTs = new Map(wsC1.map((c) => [c.timestamp, c]));
const fields = ["open", "high", "low", "close", "volume"];
for (const c of restC) {
  const w = byTs.get(c.timestamp);
  if (!w) continue;
  const bad = fields.filter((f) => String(c[f]) !== String(w[f]));
  if (bad.length) diffs.push({ ts: c.timestamp, fields: bad, rest: c, ws: w });
}
console.log(`  shared bars: ${byTs.size ? restC.filter((c) => byTs.has(c.timestamp)).length : 0} of ${restC.length} REST | mismatching: ${diffs.length}`);
for (const d of diffs) {
  console.log(`  ${dayLabel(d.ts)} (${d.ts}) differs in: ${d.fields.join(", ")}`);
  for (const f of d.fields) console.log(`      ${f.padEnd(7)} REST=${String(d.rest[f]).padEnd(14)} WS=${String(d.ws[f])}`);
}

console.log("\n=== determinism: re-fetch both surfaces 2 more times ===");
for (let i = 1; i <= 2; i++) {
  const r = (await request(`${B}/markets/${encodeURIComponent(MKT)}/candles?interval=1d`)).json.candles;
  const w = await wsSnapshot("1d");
  const m = new Map(w.map((c) => [c.timestamp, c]));
  let n = 0;
  const changed = [];
  for (const c of r) { const x = m.get(c.timestamp); if (x && fields.some((f) => String(c[f]) !== String(x[f]))) { n++; changed.push(dayLabel(c.timestamp)); } }
  console.log(`  pass ${i}: REST n=${r.length} WS n=${w.length} mismatching days=${n} [${changed.join(", ")}]`);
}

if (diffs.length) {
  const d = diffs[0];
  const dayStart = Number(d.ts);
  console.log(`\n=== third opinion for ${dayLabel(d.ts)}: REST /volume over exactly that UTC day ===`);
  const vol = await restGet("mainnet", `/markets/${encodeURIComponent(MKT)}/volume`, `?since=${dayStart}&until=${dayStart + DAY}`);
  console.log(`  GET /volume?since=${dayStart}&until=${dayStart + DAY} -> ${vol.status}`);
  console.log(`  ${vol.text.replace(/\s+/g, " ").slice(0, 420)}`);
  console.log(`  candle volume says: REST=${d.rest.volume}  WS=${d.ws.volume}`);

  console.log(`\n=== fourth opinion: count actual trades in that UTC day from /trades ===`);
  const tr = await restGet("mainnet", `/markets/${encodeURIComponent(MKT)}/trades`, `?since=${dayStart}&until=${dayStart + DAY}&limit=100`);
  const trades = tr.json?.trades ?? tr.json?.data ?? [];
  const sumBase = trades.reduce((a, t) => a + Number(t.amount ?? t.size ?? t.quantity ?? 0), 0);
  console.log(`  /trades -> ${tr.status} rows=${trades.length} sum(base qty)=${sumBase.toFixed(2)}`);
  if (trades.length) console.log(`  first row keys: ${Object.keys(trades[0]).join(",")}`);
  console.log(`  (first/last trade times: ${trades.length ? new Date(Number(trades[trades.length - 1].timestamp ?? trades[trades.length - 1].time)).toISOString() : "-"} .. ${trades.length ? new Date(Number(trades[0].timestamp ?? trades[0].time)).toISOString() : "-"})`);

  console.log(`\n=== the 6 extra WS-only days (older than REST's window) ===`);
  const restSet = new Set(restC.map((c) => c.timestamp));
  const extra = wsC1.filter((c) => !restSet.has(c.timestamp));
  console.log(`  WS-only bars: ${extra.length}`);
  for (const e of extra) console.log(`      ${dayLabel(e.timestamp)} o=${e.open} h=${e.high} l=${e.low} c=${e.close} v=${e.volume}`);
  const asked = await request(`${B}/markets/${encodeURIComponent(MKT)}/candles`, `?interval=1d&limit=${extra.length + restC.length}`);
  console.log(`  REST with ?limit=${extra.length + restC.length} -> ${asked.status} candles=${asked.json?.candles?.length ?? "-"}`);
  if (asked.json?.candles?.length) console.log(`      oldest returned: ${dayLabel(asked.json.candles[0].timestamp)}`);
}
