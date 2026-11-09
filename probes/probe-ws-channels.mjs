// Uncovered lane: /candles params, WS ohlcv+trades channels, WS vs REST candle agreement,
// and the documented "connections close after 60 seconds of inactivity".
import { request, NETWORKS } from "./rest.js";

const NET = "mainnet";
const B = NETWORKS[NET].rest;
const WS = NETWORKS[NET].ws;
const MKT = "SOMI:USDso";

console.log("=== 1. REST /markets/SOMI:USDso/candles — param discovery ===");
for (const q of ["", "?timeframe=1m", "?interval=1m", "?resolution=1m", "?timeframe=1m&limit=5",
  "?timeframe=1m&from=0", "?timeframe=1m&since=0&until=0"]) {
  const r = await request(`${B}/markets/${encodeURIComponent(MKT)}/candles${q}`);
  const body = r.text.replace(/\s+/g, " ").slice(0, 130);
  console.log(`  "${(q || "(none)").padEnd(30)}" ${r.status} ct=${(r.headers["content-type"] || "-").split(";")[0]} Error-Name=${r.headers["error-name"] || "-"} | ${body}`);
}

console.log("\n=== 2. invalid interval wording (REST) ===");
for (const tf of ["1m", "5m", "15m", "1h", "4h", "1d", "3m", "1s", "1w", "bogus"]) {
  const r = await request(`${B}/markets/${encodeURIComponent(MKT)}/candles?timeframe=${tf}`);
  console.log(`  timeframe=${tf.padEnd(6)} ${r.status} ${r.headers["error-name"] || "-"} | ${r.text.replace(/\s+/g, " ").slice(0, 95)}`);
}

function session(messages, { collectMs = 9000, idleMs = 0 } = {}) {
  return new Promise((resolve) => {
    const log = [];
    const t0 = Date.now();
    let sent = 0;
    let closedAt = null;
    const w = new WebSocket(WS);
    w.onopen = () => {
      for (const m of messages) w.send(JSON.stringify(m));
      sent = messages.length;
      log.push(`sent ${sent} message(s) at t+${Date.now() - t0}ms`);
    };
    w.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      const kind = `${m.channel ?? m.operation ?? "-"}/${m.type ?? m.errorName ?? m.status ?? "-"}`;
      let extra = "";
      if (Array.isArray(m.candles)) extra = ` candles=${m.candles.length} last=${JSON.stringify(m.candles[m.candles.length - 1])}`;
      if (Array.isArray(m.trades)) extra = ` trades=${m.trades.length} last=${JSON.stringify(m.trades[m.trades.length - 1])}`;
      if (Array.isArray(m.bids)) extra = ` bids=${m.bids.length}`;
      log.push(`t+${String(Date.now() - t0).padStart(6)}ms ${kind.padEnd(18)} ${JSON.stringify(m).slice(0, 120)}${extra}`);
    };
    w.onerror = () => log.push("ws error event");
    w.onclose = (e) => {
      closedAt = Date.now() - t0;
      log.push(`CLOSED at t+${closedAt}ms code=${e.code} reason="${e.reason}"`);
    };
    const wait = idleMs > 0 ? idleMs + 8000 : collectMs;
    setTimeout(() => {
      try { w.close(); } catch { /* already closed */ }
      setTimeout(() => resolve({ log, closedAt, aliveAt: Date.now() - t0 }), 400);
    }, wait);
  });
}

console.log("\n=== 3. WS ohlcv channel (documented: symbols + timeframe, snapshot then updates) ===");
const s1 = await session([
  { id: 1, operation: "subscribe", channel: "ohlcv", params: { symbols: [MKT], timeframe: "1m" } },
], { collectMs: 12000 });
for (const l of s1.log) console.log("   ", l);

console.log("\n=== 4. WS trades channel ===");
const s2 = await session([
  { id: 2, operation: "subscribe", channel: "trades", params: { symbols: [MKT] } },
], { collectMs: 12000 });
for (const l of s2.log) console.log("   ", l);

console.log("\n=== 5. WS ohlcv with a bad timeframe (docs constraint list: 1m/5m/15m/1h/4h/1d) ===");
const s3 = await session([
  { id: 3, operation: "subscribe", channel: "ohlcv", params: { symbols: [MKT], timeframe: "3m" } },
], { collectMs: 8000 });
for (const l of s3.log) console.log("   ", l);

console.log("\n=== 6. WS ohlcv with timeframe omitted ===");
const s4 = await session([
  { id: 4, operation: "subscribe", channel: "ohlcv", params: { symbols: [MKT] } },
], { collectMs: 8000 });
for (const l of s4.log) console.log("   ", l);

console.log("\n=== 7. idle timeout: connect, send NOTHING, wait (docs: closes after 60s inactivity) ===");
const s5 = await session([], { idleMs: 75000 });
for (const l of s5.log) console.log("   ", l);
console.log(`   measured close: ${s5.closedAt === null ? "did NOT close within 83s" : `t+${s5.closedAt}ms`}`);

console.log("\n=== 8. unsubscribe contract (docs: params is required on unsubscribe) ===");
const s6 = await session([
  { id: 5, operation: "subscribe", channel: "orderbook", params: { symbols: [MKT] } },
  { id: 6, operation: "unsubscribe", channel: "orderbook" },
], { collectMs: 9000 });
for (const l of s6.log) console.log("   ", l);
