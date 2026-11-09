// Is the WS-vs-REST candle disagreement stable, and if so, WHICH bars differ?
import { request, NETWORKS } from "./rest.js";

const B = NETWORKS.mainnet.rest;
const WS = NETWORKS.mainnet.ws;
const MKT = "SOMI:USDso";

function wsSnapshot(timeframe, hardMs = 25000) {
  return new Promise((resolve) => {
    const w = new WebSocket(WS);
    let settled = false;
    const finish = (v) => { if (settled) return; settled = true; try { w.close(); } catch { /* already closed */ } resolve(v); };
    w.onopen = () => w.send(JSON.stringify({ id: 1, operation: "subscribe", channel: "ohlcv", params: { symbol: MKT, timeframe } }));
    w.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.channel === "ohlcv" && m.type === "snapshot") finish(m.candles ?? []);
    };
    w.onerror = () => finish(null);
    setTimeout(() => finish(null), hardMs);
  });
}

const fmt = (c) => `${c.timestamp}|${c.open}/${c.high}/${c.low}/${c.close}/${c.volume}`;
const step = (cs) => (cs.length > 1 ? (Number(cs[1].timestamp) - Number(cs[0].timestamp)) / 60000 : null);

for (const tf of ["1d", "5m", "4h", "1m"]) {
  console.log(`\n########## timeframe ${tf}`);
  for (let round = 1; round <= 2; round++) {
    const wsC = await wsSnapshot(tf);
    const rest = await request(`${B}/markets/${encodeURIComponent(MKT)}/candles?interval=${tf}`);
    const restC = rest.json?.candles ?? [];
    if (!wsC) { console.log(`  round ${round}: WS snapshot did not arrive — no comparison`); continue; }
    const wsSet = new Set(wsC.map((c) => c.timestamp));
    const restSet = new Set(restC.map((c) => c.timestamp));
    const onlyWs = wsC.filter((c) => !restSet.has(c.timestamp));
    const onlyRest = restC.filter((c) => !wsSet.has(c.timestamp));
    const span = (cs) => (cs.length ? `${new Date(Number(cs[0].timestamp)).toISOString().slice(0, 16)} -> ${new Date(Number(cs[cs.length - 1].timestamp)).toISOString().slice(0, 16)}` : "empty");
    console.log(`  round ${round}: WS n=${wsC.length} step=${step(wsC)}m  REST n=${restC.length} step=${step(restC)}m`);
    console.log(`            WS  span ${span(wsC)}`);
    console.log(`            REST span ${span(restC)}`);
    console.log(`            onlyInWS=${onlyWs.length} onlyInREST=${onlyRest.length}`);
    if (onlyWs.length) console.log(`              e.g. ${fmt(onlyWs[0])}`);
    if (onlyRest.length) console.log(`              e.g. ${fmt(onlyRest[0])}`);
    const inter = wsC.filter((c) => restSet.has(c.timestamp));
    const mismatched = inter.filter((c) => {
      const r = restC.find((x) => x.timestamp === c.timestamp);
      return fmt(c) !== fmt(r);
    });
    console.log(`            shared bars with different OHLCV: ${mismatched.length} of ${inter.length}`);
    if (mismatched.length) console.log(`              WS ${fmt(mismatched[0])}  vs REST ${fmt(restC.find((x) => x.timestamp === mismatched[0].timestamp))}`);
  }
}
