// Round 2: the VERBATIM documented shapes (ohlcv takes singular `symbol`; trades takes `limit`),
// plus the REST interval set and the correct unsubscribe form.
import { request, NETWORKS } from "./rest.js";

const NET = "mainnet";
const B = NETWORKS[NET].rest;
const WS = NETWORKS[NET].ws;
const MKT = "SOMI:USDso";

function session(messages, collectMs = 10000) {
  return new Promise((resolve) => {
    const log = [];
    const t0 = Date.now();
    let last = null;
    const w = new WebSocket(WS);
    w.onopen = () => { for (const m of messages) w.send(JSON.stringify(m)); log.push(`sent ${messages.length} @ t+${Date.now() - t0}ms`); };
    w.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      last = m;
      let extra = "";
      if (Array.isArray(m.candles)) extra = ` || candles=${m.candles.length} FIRST=${JSON.stringify(m.candles[0])} LAST=${JSON.stringify(m.candles[m.candles.length - 1])}`;
      if ("trades" in m) extra = ` || trades=${JSON.stringify(m.trades)?.slice(0, 90)}`;
      log.push(`t+${String(Date.now() - t0).padStart(6)}ms ${JSON.stringify(m).slice(0, 130)}${extra}`);
    };
    w.onclose = (e) => log.push(`CLOSE t+${Date.now() - t0}ms code=${e.code}`);
    setTimeout(() => { try { w.close(); } catch { /* already closed */ } setTimeout(() => resolve({ log, last }), 300); }, collectMs);
  });
}

console.log("=== A. ohlcv with the documented singular `symbol` + timeframe ===");
for (const tf of ["1m", "1h", "1d"]) {
  const s = await session([{ id: 1, operation: "subscribe", channel: "ohlcv", params: { symbol: MKT, timeframe: tf } }], 9000);
  console.log(`  timeframe=${tf}`);
  for (const l of s.log.slice(0, 4)) console.log("     ", l.slice(0, 300));
}

console.log("\n=== B. contrast: ohlcv with the PLURAL `symbols` form (as orderbook uses) ===");
const sb = await session([{ id: 2, operation: "subscribe", channel: "ohlcv", params: { symbols: [MKT], timeframe: "1m" } }], 6000);
for (const l of sb.log.slice(0, 3)) console.log("   ", l.slice(0, 220));

console.log("\n=== C. trades with the documented `limit` (earlier: no limit -> trades:null) ===");
const st = await session([{ id: 3, operation: "subscribe", channel: "trades", params: { symbols: [MKT], limit: 100 } }], 9000);
for (const l of st.log.slice(0, 4)) console.log("   ", l.slice(0, 320));
console.log("\n   --- same subscribe WITHOUT limit ---");
const st2 = await session([{ id: 4, operation: "subscribe", channel: "trades", params: { symbols: [MKT] } }], 9000);
for (const l of st2.log.slice(0, 3)) console.log("   ", l.slice(0, 320));

console.log("\n=== D. unsubscribe with params (required per docs) ===");
const su = await session([
  { id: 5, operation: "subscribe", channel: "orderbook", params: { symbols: [MKT] } },
  { id: 6, operation: "unsubscribe", channel: "orderbook", params: { symbols: [MKT] } },
], 8000);
for (const l of su.log) console.log("   ", l.slice(0, 200));

console.log("\n=== E. REST /candles interval set (WS docs constrain timeframe to 1m/5m/15m/1h/4h/1d) ===");
for (const iv of ["1m", "5m", "15m", "1h", "4h", "1d", "3m", "1w", "1s", "bogus", "1M", "60"]) {
  const r = await request(`${B}/markets/${encodeURIComponent(MKT)}/candles?interval=${iv}`);
  const n = r.json?.candles?.length;
  console.log(`  interval=${iv.padEnd(6)} ${r.status} ${r.headers["error-name"] || "-"} candles=${n ?? "-"} | ${r.status !== 200 ? r.text.replace(/\s+/g, " ").slice(0, 80) : ""}`);
}

console.log("\n=== F. do the two surfaces agree on candles? WS ohlcv snapshot vs REST /candles ===");
const sws = await session([{ id: 7, operation: "subscribe", channel: "ohlcv", params: { symbol: MKT, timeframe: "1m" } }], 9000);
const srest = await request(`${B}/markets/${encodeURIComponent(MKT)}/candles?interval=1m`);
const wsSnap = (sws.last?.candles ?? []);
const restC = (srest.json?.candles ?? []);
console.log(`  WS snapshot candles : ${wsSnap.length}`);
console.log(`  REST candles        : ${restC.length}`);
const fmt = (c) => c ? `${c.timestamp}|${c.open}/${c.high}/${c.low}/${c.close}/${c.volume}` : "none";
console.log(`  WS   LAST: ${fmt(wsSnap[wsSnap.length - 1])}`);
console.log(`  REST LAST: ${fmt(restC[restC.length - 1])}`);
console.log(`  WS   FIRST: ${fmt(wsSnap[0])}`);
console.log(`  REST FIRST: ${fmt(restC[0])}`);

console.log("\n=== G. does WS document `interval` anywhere, or only REST? (field-name split) ===");
const rG = await request(`${B}/markets/${encodeURIComponent(MKT)}/candles?timeframe=1m&interval=1m`);
console.log(`  both names supplied -> ${rG.status} candles=${rG.json?.candles?.length ?? "-"}`);
