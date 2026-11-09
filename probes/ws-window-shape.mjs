const BASES = {
  mainnet: { rest: "https://api.dreamdex.io/v0", ws: "wss://api.dreamdex.io/v0/ws/public" },
  shannon: { rest: "https://stg.api.dreamdex.io/v0", ws: "wss://stg.api.dreamdex.io/v0/ws/public" },
};
const DAY = 86400000;

function wsDaily(wsUrl, symbol, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const sock = new WebSocket(wsUrl);
    const timer = setTimeout(() => { try { sock.close(); } catch {} resolve({ err: "timeout" }); }, timeoutMs);
    sock.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.channel === "ohlcv" && m.type === "snapshot") {
        clearTimeout(timer); try { sock.close(); } catch {}
        resolve({ candles: m.candles || [] });
      }
    };
    sock.onerror = () => { clearTimeout(timer); resolve({ err: "ws error" }); };
    sock.onopen = () => sock.send(JSON.stringify({
      id: 1, operation: "subscribe", channel: "ohlcv",
      params: { symbol, timeframe: "1d" },
    }));
  });
}

for (const [name, b] of Object.entries(BASES)) {
  const mk = await (await fetch(`${b.rest}/markets`)).json();
  const sym = mk.markets[0].symbol;
  const cd = await (await fetch(`${b.rest}/markets/${encodeURIComponent(sym)}/candles?interval=1d`)).json();
  const ws = await wsDaily(b.ws, sym);
  const iso = (t) => new Date(t).toISOString();
  const days = (arr, f) => arr.map(f).filter((x) => typeof x === "number");
  const restTs = days(cd.candles, (c) => c.timestamp);
  const wsTs = days(ws.candles || [], (c) => c.t ?? c.timestamp ?? c[0]);
  console.log(`\n=== ${name}  market=${sym}  now=${iso(Date.now())}`);
  console.log(`REST /candles   n=${restTs.length}  oldest=${iso(Math.min(...restTs))}  newest=${iso(Math.max(...restTs))}`);
  if (ws.candles) {
    console.log(`WS   ohlcv 1d  n=${wsTs.length}  oldest=${iso(Math.min(...wsTs))}  newest=${iso(Math.max(...wsTs))}`);
    const span = (Math.max(...wsTs) - Math.min(...wsTs)) / DAY + 1;
    console.log(`WS span days=${span}  (n=${wsTs.length})  -> capped at ${wsTs.length} bars, oldest = newest - (n-1) days`);
    console.log(`gap: WS has ${Math.round((Math.min(...restTs) - Math.min(...wsTs)) / DAY)} bars older than REST oldest`);
  } else console.log("WS ohlcv:", ws.err);
}
