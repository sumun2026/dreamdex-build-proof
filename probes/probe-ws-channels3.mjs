// Decisive test: (1) does any surface ever emit the documented `invalid_interval`?
// (2) is the missing 1d ohlcv snapshot real, across all six documented timeframes, with a long window?
import { request, NETWORKS } from "./rest.js";

const NET = "mainnet";
const B = NETWORKS[NET].rest;
const WS = NETWORKS[NET].ws;
const MKT = "SOMI:USDso";
const TF = ["1m", "5m", "15m", "1h", "4h", "1d"];

function waitForMessage(sendMsg, matchMs, predicate, hardMs = 40000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const seen = [];
    const w = new WebSocket(WS);
    let settled = false;
    const done = (obj) => { if (settled) return; settled = true; try { w.close(); } catch { /* already closed */ } resolve(obj); };
    w.onopen = () => w.send(JSON.stringify(sendMsg));
    w.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      seen.push({ at: Date.now() - t0, m });
      if (predicate(m)) done({ hit: true, at: Date.now() - t0, m, seen });
    };
    w.onclose = () => done({ hit: false, seen, closedAt: Date.now() - t0 });
    w.onerror = () => {};
    setTimeout(() => done({ hit: false, seen, timedOut: true }), hardMs);
    void matchMs;
  });
}

console.log("=== 1. does any surface emit invalid_interval? ===");
console.log("  REST, unsupported interval:");
for (const iv of ["3m", "1w", "bogus"]) {
  const r = await request(`${B}/markets/${encodeURIComponent(MKT)}/candles?interval=${iv}`);
  console.log(`    interval=${iv.padEnd(6)} ${r.status} name=${r.json?.name} header=${r.headers["error-name"] || "-"}`);
}
console.log("  WS ohlcv, unsupported timeframe (correct singular shape):");
for (const tf of ["3m", "1w", ""]) {
  const res = await waitForMessage(
    { id: 1, operation: "subscribe", channel: "ohlcv", params: tf ? { symbol: MKT, timeframe: tf } : { symbol: MKT } },
    0, (m) => m.type === "error" || m.type === "snapshot", 18000);
  const first = res.seen[0]?.m;
  console.log(`    timeframe=${(tf || "(omitted)").padEnd(6)} -> ${first ? `${first.errorName ?? first.type ?? "-"}` : "(no reply)"} | ${JSON.stringify(first).slice(0, 110)}`);
}

console.log("\n=== 2. ohlcv snapshot arrival per documented timeframe (30s window each) ===");
const summary = [];
for (const tf of TF) {
  const res = await waitForMessage(
    { id: 2, operation: "subscribe", channel: "ohlcv", params: { symbol: MKT, timeframe: tf } },
    0, (m) => m.channel === "ohlcv" && m.type === "snapshot", 30000);
  const restC = await request(`${B}/markets/${encodeURIComponent(MKT)}/candles?interval=${tf}`);
  const restN = restC.json?.candles?.length ?? "-";
  const n = res.m?.candles?.length ?? 0;
  const kinds = res.seen.map((s) => `${s.m.type ?? s.m.errorName ?? "?"}@${s.at}ms`).join(",");
  console.log(`  ${tf.padEnd(4)} WS snapshot=${res.hit ? `YES candles=${n}` : "NO (30s elapsed)"} | REST candles=${restN} | msgs: ${kinds}`);
  summary.push({ tf, ws: res.hit ? n : null, rest: restN });
}

console.log("\n=== 3. repeat the two worst cases once more (is it stable, or slow?) ===");
for (const tf of ["1d", "4h"]) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await waitForMessage(
      { id: 3, operation: "subscribe", channel: "ohlcv", params: { symbol: MKT, timeframe: tf } },
      0, (m) => m.channel === "ohlcv" && m.type === "snapshot", 35000);
    console.log(`  ${tf} attempt ${attempt}: snapshot=${res.hit ? `YES(${res.m.candles.length})` : "NO"} first3=${res.seen.slice(0, 3).map((s) => s.m.type ?? s.m.errorName).join(",")} waited=${res.seen.length ? res.seen[res.seen.length - 1].at : "-"}ms`);
  }
}

console.log("\n=== 4. is `interval` documented for REST /candles anywhere on the trading page? ===");
const page = await request(`${B}`); // touch only to confirm host; doc text read from saved page below
void page;
import fs from "node:fs";
const txt = fs.readFileSync(new URL("./src/LIVE_http-api-trading.txt", import.meta.url), "utf8");
const L = txt.split("\n");
const idx = L.map((l, i) => [l, i]).filter(([l]) => /interval|candles|timeframe/i.test(l));
console.log(`  trading doc page: ${L.length} lines, ${idx.length} mentions of interval|candles|timeframe`);
for (const [l, i] of idx.slice(0, 14)) console.log(`    ${i}: ${l.slice(0, 120)}`);
