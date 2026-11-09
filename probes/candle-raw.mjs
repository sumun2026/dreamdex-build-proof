// Raw shapes, printed instead of guessed. Both surfaces, one market.
const SYM = "SOMI:USDso";
const r = await (await fetch(`https://api.dreamdex.io/v0/markets/${SYM}/candles?interval=1d`)).json();
console.log("/candles top keys:", Object.keys(r), "n=", r.candles?.length);
console.log("  first row:", JSON.stringify(r.candles?.[0]));
console.log("  last row: ", JSON.stringify(r.candles?.[r.candles.length - 1]));

const candles = await new Promise((resolve) => {
  const w = new WebSocket("wss://api.dreamdex.io/v0/ws/public");
  const t = setTimeout(() => resolve([]), 20000);
  w.onopen = () => w.send(JSON.stringify({ id: 1, operation: "subscribe", channel: "ohlcv", params: { symbol: SYM, timeframe: "1d" } }));
  w.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.channel === "ohlcv" && m.type === "snapshot") { clearTimeout(t); try { w.close(); } catch {} resolve(m.candles ?? []); }
  };
  w.onerror = () => { clearTimeout(t); resolve([]); };
});
console.log("ws ohlcv snapshot keys: type/channel/candles?", typeof candles[0], "n=", candles.length);
console.log("  first row:", JSON.stringify(candles[0]));
