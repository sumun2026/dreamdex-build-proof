// Airtight version: for EVERY daily bar in REST's window, compare /candles volume against
// /volume for that exact UTC day. One disagreeing day out of ~94 is a bug; the control is that
// the other 93 agree.
import { restGet, NETWORKS } from "./rest.js";

const MKT = "SOMI:USDso";
const DAY = 86400000;
const label = (ts) => new Date(Number(ts)).toISOString().slice(0, 10);

const candles = (await restGet("mainnet", `/markets/${encodeURIComponent(MKT)}/candles`, "?interval=1d")).json.candles;
const wsRes = await new Promise((resolve) => {
  const w = new WebSocket(NETWORKS.mainnet.ws);
  const t = setTimeout(() => resolve(null), 25000);
  w.onopen = () => w.send(JSON.stringify({ id: 1, operation: "subscribe", channel: "ohlcv", params: { symbol: MKT, timeframe: "1d" } }));
  w.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.channel === "ohlcv" && m.type === "snapshot") { clearTimeout(t); try { w.close(); } catch { /* already closed */ } resolve(m.candles ?? []); } };
  w.onerror = () => { clearTimeout(t); resolve(null); };
});
const wsByTs = new Map((wsRes ?? []).map((c) => [c.timestamp, c]));

console.log(`REST /candles?interval=1d -> ${candles.length} bars; WS ohlcv snapshot -> ${(wsRes ?? []).length} bars`);
console.log("checking each REST daily bar's volume against REST /volume for that UTC day\n");

const mismatched = [];
const unchecked = [];
for (const c of candles) {
  const start = Number(c.timestamp);
  const v = await restGet("mainnet", `/markets/${encodeURIComponent(MKT)}/volume`, `?since=${start}&until=${start + DAY}`);
  if (v.status !== 200) { unchecked.push({ c, status: v.status, name: v.json?.name }); continue; }
  const vol = v.json.baseVolume;
  if (String(vol) !== String(c.volume)) mismatched.push({ c, vol });
}
console.log(`bars compared: ${candles.length - unchecked.length} | volume mismatches: ${mismatched.length} | not comparable: ${unchecked.length}`);
for (const m of mismatched) {
  const w = wsByTs.get(m.c.timestamp);
  console.log(`\n  ${label(m.c.timestamp)}  (ts=${m.c.timestamp})`);
  console.log(`     /candles  volume=${m.c.volume}  open=${m.c.open} high=${m.c.high} low=${m.c.low} close=${m.c.close}`);
  console.log(`     /volume   volume=${m.vol}      <- same vendor, same UTC day`);
  console.log(`     WS ohlcv  volume=${w?.volume ?? "(absent)"}  open=${w?.open ?? "-"} high=${w?.high ?? "-"} low=${w?.low ?? "-"} close=${w?.close ?? "-"}`);
  console.log(`     ratio /volume vs /candles = ${(Number(m.vol) / Number(m.c.volume)).toFixed(3)}x`);
}
if (unchecked.length) {
  console.log(`\n  /volume refused for ${unchecked.length} bar(s): ${unchecked.slice(0, 4).map((u) => `${label(u.c.timestamp)}=${u.status}/${u.name ?? "-"}`).join(", ")} ...`);
  console.log(`  oldest unchecked: ${label(unchecked[unchecked.length - 1].c.timestamp)}, newest unchecked: ${label(unchecked[0].c.timestamp)}`);
}

console.log("\n=== position of the mismatching bar inside the REST series ===");
for (const m of mismatched) {
  const i = candles.findIndex((c) => c.timestamp === m.c.timestamp);
  console.log(`  ${label(m.c.timestamp)} is index ${i} of ${candles.length} (oldest=${label(candles[0].timestamp)}, newest=${label(candles[candles.length - 1].timestamp)})`);
}
console.log("\n=== the two days either side of the mismatch, for context ===");
for (const m of mismatched) {
  const i = candles.findIndex((c) => c.timestamp === m.c.timestamp);
  for (const j of [i - 1, i, i + 1]) {
    if (!candles[j]) continue;
    const v = await restGet("mainnet", `/markets/${encodeURIComponent(MKT)}/volume`, `?since=${Number(candles[j].timestamp)}&until=${Number(candles[j].timestamp) + DAY}`);
    console.log(`  ${label(candles[j].timestamp)} /candles=${candles[j].volume}  /volume=${v.json?.baseVolume ?? v.status}`);
  }
}
