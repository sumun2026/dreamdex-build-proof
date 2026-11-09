// Bar-by-bar WS-ohlcv vs REST-/candles diff for EVERY market on a base, cheap (1 REST + 1 WS each).
const ENV = process.argv[2] ?? "mainnet";
const BASES = {
  mainnet: { rest: "https://api.dreamdex.io/v0", ws: "wss://api.dreamdex.io/v0/ws/public" },
  shannon: { rest: "https://stg.api.dreamdex.io/v0", ws: "wss://stg.api.dreamdex.io/v0/ws/public" },
};
const BASE = BASES[ENV];
const iso = (t) => new Date(Number(t)).toISOString().slice(0, 10);

const markets = (await (await fetch(`${BASE.rest}/markets`)).json()).markets.map((m) => m.symbol);
console.log(`${ENV} — ${markets.length} REST markets, interval=1d, WS ${BASE.ws}\n`);

for (const sym of markets) {
  const cj = await (await fetch(`${BASE.rest}/markets/${encodeURIComponent(sym)}/candles?interval=1d`)).json();
  const bars = cj.candles ?? [];
  const wsBars = await new Promise((resolve) => {
    const w = new WebSocket(BASE.ws);
    const t = setTimeout(() => { try { w.close(); } catch {} resolve([]); }, 20000);
    w.onopen = () => w.send(JSON.stringify({ id: 1, operation: "subscribe", channel: "ohlcv", params: { symbol: sym, timeframe: "1d" } }));
    w.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.channel === "ohlcv" && m.type === "snapshot") { clearTimeout(t); try { w.close(); } catch {} resolve(m.candles ?? []); }
    };
    w.onerror = () => { clearTimeout(t); resolve([]); };
  });
  const map = new Map(wsBars.map((b) => [Number(b.timestamp), b]));
  const bad = [];
  for (let i = 0; i < bars.length; i++) {
    const w = map.get(Number(bars[i].timestamp));
    if (!w) continue;
    if (String(w.volume) !== String(bars[i].volume) || String(w.open) !== String(bars[i].open)) bad.push({ i, t: Number(bars[i].timestamp), r: bars[i], w });
  }
  console.log(`${sym.padEnd(12)} rest=${bars.length} ws=${wsBars.length} oldest=${bars.length ? iso(bars[0].timestamp) : "-"} | disagreeing bars=${bad.length}`);
  for (const b of bad) {
    const v = await (await fetch(`${BASE.rest}/markets/${encodeURIComponent(sym)}/volume?since=${b.t}&until=${b.t + 86400000}`)).json();
    console.log(`   index ${b.i} of ${bars.length}  ${iso(b.t)}  /candles vol=${b.r.volume} open=${b.r.open} | ws vol=${b.w.volume} open=${b.w.open} | /volume ${v.baseVolume ?? v.payload?.baseVolume ?? JSON.stringify(v).slice(0, 60)}`);
  }
}
