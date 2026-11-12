// Watch LIVE WS update frames (not snapshots) on mainnet SOMI:USDso and diff each against REST.
// Read-only: public subscribe, unauthenticated GETs. No keys, no signatures.
const REST = "https://api.dreamdex.io/v0";
const WS = "wss://api.dreamdex.io/v0/ws/public";
const MKT = "SOMI:USDso";
const SECONDS = Number(process.argv[2] ?? 180);

const get = async (p) => {
  const r = await fetch(`${REST}${p}`);
  return { status: r.status, json: await r.json().catch(() => null) };
};

// CONTROL: are trades actually flowing on this market right now? (REST, twice, around the window)
const t0 = await get(`/markets/${encodeURIComponent(MKT)}/trades`);
const ids0 = new Set((t0.json?.trades ?? []).map((t) => t.id));
console.log(`control: REST /trades before the window -> ${ids0.size} trades, newest ts=${(t0.json?.trades ?? [])[0]?.timestamp}`);

const frames = [];
const sock = new WebSocket(WS);
let opened = false;

sock.onopen = () => {
  opened = true;
  sock.send(JSON.stringify({ id: 1, operation: "subscribe", channel: "ohlcv", params: { symbol: MKT, timeframe: "1m" } }));
  sock.send(JSON.stringify({ id: 2, operation: "subscribe", channel: "trades", params: { symbols: [MKT] } }));
  console.log(`subscribed ohlcv(1m, singular string symbol) + trades(plural symbols ARRAY — the shape that gets "subscribed") on ${WS}`);
};
sock.onmessage = (ev) => {
  let m;
  try { m = JSON.parse(ev.data); } catch { frames.push({ raw: ev.data.slice(0, 120) }); return; }
  frames.push(m);
};
sock.onerror = (e) => console.log("ws error", e?.message ?? "");

await new Promise((r) => setTimeout(r, SECONDS * 1000));
try { sock.close(); } catch {}

const acks = frames.filter((f) => f.type === "ack" || f.operation === "subscribe");
const snaps = frames.filter((f) => f.type === "snapshot");
const updates = frames.filter((f) => f.type === "update");
const others = frames.filter((f) => !acks.includes(f) && !snaps.includes(f) && !updates.includes(f));

console.log(`\nframes in ${SECONDS}s: total=${frames.length} ack=${acks.length} snapshot=${snaps.length} update=${updates.length} other=${others.length}`);
console.log(`frames that echo a client id (any "id" field present): ${frames.filter((f) => "id" in f).length} / ${frames.length}`);
for (const a of acks) console.log(`  ack   id=${a.id} channel=${a.channel ?? "-"} status=${a.status ?? a.result ?? JSON.stringify(a).slice(0, 80)}`);
for (const s of snaps) console.log(`  snap  id=${s.id} channel=${s.channel} n=${(s.candles ?? s.trades ?? []).length} first=${JSON.stringify((s.candles ?? s.trades ?? [])[0] ?? null).slice(0, 150)}`);
console.log(`\n--- update frames (${updates.length}) ---`);
for (const u of updates.slice(0, 40)) {
  console.log(`  id=${u.id} channel=${u.channel} payload=${JSON.stringify(u).slice(0, 220)}`);
}
if (others.length) {
  console.log(`\n--- other frames (${others.length}), first 8 ---`);
  for (const o of others.slice(0, 8)) console.log("  " + JSON.stringify(o).slice(0, 220));
}

// Cross-check the newest live 1m bar against REST for the same minute.
const lastOhlcv = [...updates].reverse().find((u) => u.channel === "ohlcv" && u.candles?.length)
  ?? snaps.find((s) => s.channel === "ohlcv")?.candles?.length ? { candles: snaps.find((s) => s.channel === "ohlcv").candles.slice(-1) } : null;
if (lastOhlcv?.candles?.length) {
  const c = lastOhlcv.candles[candlesIdx(lastOhlcv.candles.length - 1)];
  const r = await get(`/markets/${encodeURIComponent(MKT)}/candles?interval=1m`);
  const rb = (r.json?.candles ?? []).find((x) => Number(x.timestamp) === Number(c.timestamp));
  console.log(`\n=== live WS 1m bar ts=${c.timestamp} vs REST ===`);
  console.log("  ws  :", JSON.stringify(c));
  console.log("  rest:", JSON.stringify(rb ?? `(no bar for that minute; REST last=${JSON.stringify((r.json?.candles ?? []).slice(-1)[0])})`));
  console.log(`  REST /candles 1m returned ${(r.json?.candles ?? []).length} bars, status ${r.status}`);
}
function candlesIdx(i) { return i; }

// Trades: does the live WS trade stream agree with REST trades for the same ids/timestamps?
const liveTrades = updates.filter((u) => u.channel === "trades").flatMap((u) => u.trades ?? []);
const rT = await get(`/markets/${encodeURIComponent(MKT)}/trades`);
console.log(`\n=== trades: live WS frames=${updates.filter((u) => u.channel === "trades").length} trades=${liveTrades.length} | REST status=${rT.status} n=${(rT.json?.trades ?? []).length} ===`);
if (liveTrades.length) console.log("  ws trade[0]:", JSON.stringify(liveTrades[0]));
if (rT.json?.trades?.length) console.log("  rest trade[0]:", JSON.stringify(rT.json.trades[0]));
const overlap = liveTrades.filter((t) => (rT.json?.trades ?? []).some((x) => x.timestamp === t.timestamp && x.price === t.price)).length;
console.log(`  live trades also present in the REST /trades page: ${overlap}/${liveTrades.length}`);

const t1 = await get(`/markets/${encodeURIComponent(MKT)}/trades`);
const ids1 = (t1.json?.trades ?? []).map((t) => t.id);
const fresh = ids1.filter((id) => !ids0.has(id)).length;
console.log(`\ncontrol after the ${SECONDS}s window: REST /trades now ${ids1.length} rows, newest ts=${ids1.length ? (t1.json.trades[0].timestamp) : "-"}`);
console.log(`  trades that appeared on REST during the window and were NOT delivered on the WS trades channel: ${fresh}`);
console.log(`  (WS trades update frames received: ${updates.filter((u) => u.channel === "trades").length})`);
