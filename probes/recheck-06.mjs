// Same-turn re-verification of item 06's headline: three dreamDEX surfaces, one UTC day.
const BASE = "https://api.dreamdex.io/v0";
const WS = "wss://api.dreamdex.io/v0/ws/public";
const SYM = "SOMI:USDso";
const DAY = "2026-08-06";
const startMs = Date.parse(`${DAY}T00:00:00Z`);

const j = await (await fetch(`${BASE}/markets/${SYM}/candles?interval=1d`)).json();
const arr = j.candles ?? j.payload?.candles ?? (Array.isArray(j) ? j : []);
const of = (b) => ({ t: b.timestamp ?? b.time ?? b[0], o: b.open ?? b[1], h: b.high ?? b[2], v: b.volume ?? b[5] });
const iso = (t) => new Date(t).toISOString();
const day = (t) => iso(t).slice(0, 10);
const c = arr.map(of).find((b) => day(b.t) === DAY);
console.log(`/candles  n=${arr.length}  first=${arr.length ? day(arr[0].timestamp ?? arr[0][0]) : "-"}  ${DAY}: volume=${c?.v}  open=${c?.o}  high=${c?.h}`);

const v = await (await fetch(`${BASE}/markets/${SYM}/volume?since=${startMs}&until=${startMs + 86400000}`)).json();
console.log(`/volume   ${DAY}: ${JSON.stringify(v.payload ?? v)}`);

const candles = await new Promise((resolve) => {
  const w = new WebSocket(WS);
  const t = setTimeout(() => resolve([]), 20000);
  w.onopen = () => w.send(JSON.stringify({ id: 1, operation: "subscribe", channel: "ohlcv", params: { symbol: SYM, timeframe: "1d" } }));
  w.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.channel === "ohlcv" && m.type === "snapshot") { clearTimeout(t); try { w.close(); } catch {} resolve(m.candles ?? []); }
  };
  w.onerror = () => { clearTimeout(t); resolve([]); };
});
const d = candles.map(of).find((b) => day(b.t) === DAY);
console.log(`ws ohlcv  n=${candles.length}  first=${candles.length ? day(candles[0].timestamp ?? candles[0][0]) : "-"}  ${DAY}: volume=${d?.v}  open=${d?.o}  high=${d?.h}`);
if (c && d) console.log(`ratio ws//candles = ${(d.v / c.v).toFixed(3)}x   open delta = ${(d.o - c.o).toFixed(6)}`);
