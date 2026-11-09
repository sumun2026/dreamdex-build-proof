const BASES = {
  mainnet: { rest: "https://api.dreamdex.io/v0", ws: "wss://api.dreamdex.io/v0/ws/public" },
  shannon: { rest: "https://stg.api.dreamdex.io/v0", ws: "wss://stg.api.dreamdex.io/v0/ws/public" },
};
const IVS = ["1m", "5m", "15m", "1h", "4h", "1d", "3m", "1w", "1s", "bogus", "1M", "60"];

for (const [name, b] of Object.entries(BASES)) {
  console.log(`\n===== ${name}  ${b.rest}`);
  for (const iv of IVS) {
    const r = await fetch(`${b.rest}/markets/SOMI:USDso/candles?interval=${encodeURIComponent(iv)}`);
    const body = (await r.text()).slice(0, 170);
    console.log(`  interval=${iv.padEnd(5)} ${r.status}  error-name=${String(r.headers.get("error-name"))}  ${body}`);
  }
  // no interval at all
  const none = await fetch(`${b.rest}/markets/SOMI:USDso/candles`);
  console.log(`  interval=<absent> ${none.status}  error-name=${String(none.headers.get("error-name"))}  ${(await none.text()).slice(0, 170)}`);

  for (const tf of ["3m", "1w", null]) {
    const res = await new Promise((resolve) => {
      const s = new WebSocket(b.ws);
      const to = setTimeout(() => resolve("timeout"), 12000);
      const seen = [];
      s.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.channel === "ohlcv" || m.type === "error" || m.errorName) {
          seen.push(JSON.stringify(m).slice(0, 160));
          clearTimeout(to); s.close(); resolve(seen);
        }
      };
      s.onerror = () => { clearTimeout(to); resolve("ws error"); };
      s.onopen = () => s.send(JSON.stringify({
        id: 7, operation: "subscribe", channel: "ohlcv",
        params: tf === null ? { symbol: "SOMI:USDso" } : { symbol: "SOMI:USDso", timeframe: tf },
      }));
    });
    console.log(`  ws timeframe=${String(tf).padEnd(5)} -> ${typeof res === "string" ? res : res.join(" ;; ")}`);
  }
}
