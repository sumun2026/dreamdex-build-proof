// Decisive test: does the WS `trades` channel keep delivering while the market keeps trading?
// Instrumented: every frame timestamped, keepalive ping/pong, REST /trades sampled at both ends.
// Read-only, unauthenticated. No keys, no signatures.
const REST = "https://api.dreamdex.io/v0";
const WS = "wss://api.dreamdex.io/v0/ws/public";
const MKT = "SOMI:USDso";
const SECONDS = Number(process.argv[2] ?? 300);
const DAY = 86400000;
const t00 = Date.now();
const at = () => `t+${String(Date.now() - t00).padStart(6)}ms`;

const get = async (p) => {
  const r = await fetch(`${REST}${p}`);
  return { status: r.status, json: await r.json().catch(() => null) };
};

const restTrades = async () => {
  const r = await get(`/markets/${encodeURIComponent(MKT)}/trades`);
  const list = r.json?.trades ?? [];
  return { status: r.status, n: list.length, newest: list[0]?.timestamp, oldest: list[list.length - 1]?.timestamp, ids: new Set(list.map((t) => t.id)), list };
};

const log = [];
const liveTrades = [];
const liveOhlcv = [];
let open = false, closed = null, sockErrs = 0, pingsSent = 0, pongs = 0;

const sock = new WebSocket(WS);
sock.onopen = () => {
  open = true;
  log.push(`${at()} OPEN`);
  sock.send(JSON.stringify({ id: 1, operation: "subscribe", channel: "trades", params: { symbols: [MKT] } }));
  sock.send(JSON.stringify({ id: 2, operation: "subscribe", channel: "ohlcv", params: { symbol: MKT, timeframe: "1m" } }));
};
sock.onmessage = (ev) => {
  let m; try { m = JSON.parse(ev.data); } catch { log.push(`${at()} RAW ${ev.data.slice(0, 80)}`); return; }
  if (m.type === "pong") { pongs++; log.push(`${at()} pong`); return; }
  if (m.channel === "trades" && m.type === "update") { liveTrades.push({ ...m.trade, recv: Date.now() }); log.push(`${at()} TRADE ts=${m.trade.timestamp} id=${m.trade.id} ${m.trade.side} ${m.trade.quantity}@${m.trade.price}`); return; }
  if (m.channel === "ohlcv" && m.type === "update") { liveOhlcv.push(m.candle); return; }
  log.push(`${at()} ${m.type}/${m.channel ?? "-"} ${JSON.stringify(m).slice(0, 110)}`);
};
sock.onerror = (e) => { sockErrs++; log.push(`${at()} ERROR ${e?.message ?? "(no message)"}`); };
sock.onclose = (e) => { closed = { code: e.code, reason: e.reason }; log.push(`${at()} CLOSE code=${e.code} reason="${e.reason}"`); };

const before = await restTrades();
console.log(`REST /trades at start: status=${before.status} n=${before.n} newest=${before.newest}`);

const pingTimer = setInterval(() => {
  if (sock.readyState === 1) { pingsSent++; sock.send(JSON.stringify({ id: 900 + pingsSent, operation: "ping" })); }
  else log.push(`${at()} ping skipped, readyState=${sock.readyState}`);
}, 20000);

await new Promise((r) => setTimeout(r, SECONDS * 1000));
clearInterval(pingTimer);
try { sock.close(); } catch {}
await new Promise((r) => setTimeout(r, 1500));

const after = await restTrades();
const fresh = after.list.filter((t) => !before.ids.has(t.id));
const quietestTrade = fresh.length ? fresh[fresh.length - 1] : null;

console.log(`\n=== ${SECONDS}s window ===`);
console.log(`socket: open=${open} close=${closed ? `code ${closed.code}` : "still open at end"} onerror=${sockErrs} pings=${pingsSent} pongs=${pongs}`);
console.log(`readyState at end of window: ${sock.readyState} (1 = OPEN, 2 = CLOSING, 3 = CLOSED)`);
console.log(`WS trades updates      : ${liveTrades.length}`);
console.log(`WS ohlcv  1m updates   : ${liveOhlcv.length}`);
console.log(`REST trades new in the same window: ${fresh.length}  (newest ts ${after.newest})`);
if (fresh.length) console.log(`  first fresh ${fresh[0].timestamp} | last fresh ${quietestTrade.timestamp}`);
if (liveTrades.length) console.log(`  WS trade ts range: ${liveTrades[0].timestamp} .. ${liveTrades[liveTrades.length - 1].timestamp}`);
if (liveTrades.length && fresh.length) {
  const wsLast = Math.max(...liveTrades.map((t) => Number(t.timestamp)));
  const restLast = Math.max(...fresh.map((t) => Number(t.timestamp)));
  console.log(`\n  last WS trade ts=${wsLast} vs newest fresh REST trade ts=${restLast} -> REST is ${(restLast - wsLast) / 1000}s ahead of what the WS stream delivered`);
  const wsIds = new Set(liveTrades.map((t) => String(t.id)));
  const byTs = fresh.filter((t) => liveTrades.some((w) => Number(w.timestamp) === Number(t.timestamp)));
  console.log(`  fresh REST trades that the WS DID deliver (matched by timestamp): ${byTs.length}/${fresh.length}`);
  console.log(`  fresh REST trades whose id string appears in any WS frame: ${fresh.filter((t) => wsIds.has(String(t.id))).length}/${fresh.length}`);
  console.log(`  id formats -> WS: ${liveTrades[0]?.id}   REST: ${fresh[0]?.id}`);
}

console.log(`\n--- frame log ---`);
for (const l of log) console.log("  " + l);
