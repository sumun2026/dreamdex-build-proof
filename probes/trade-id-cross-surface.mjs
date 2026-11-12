// The same trade, read from both first-party surfaces, printed side by side.
// Question: is there ANY shared key a client can use to reconcile the WS stream against REST history?
// Read-only, unauthenticated.
const REST = "https://api.dreamdex.io/v0";
const WS = "wss://api.dreamdex.io/v0/ws/public";
const MKT = "SOMI:USDso";
const SECONDS = Number(process.argv[2] ?? 120);
const t0 = Date.now();

const wsTrades = [];
const sock = new WebSocket(WS);
sock.onopen = () => sock.send(JSON.stringify({ id: 1, operation: "subscribe", channel: "trades", params: { symbols: [MKT] } }));
sock.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.type === "update" && m.channel === "trades") wsTrades.push(m.trade);
  if (m.type === "snapshot" && m.channel === "trades") for (const t of m.trades ?? []) wsTrades.push({ ...t, _from: "snapshot" });
};
await new Promise((r) => setTimeout(r, SECONDS * 1000));
try { sock.close(); } catch {}
await new Promise((r) => setTimeout(r, 800));

const rj = await (await fetch(`${REST}/markets/${encodeURIComponent(MKT)}/trades`)).json();
const rest = rj.trades ?? [];
const upd = wsTrades.filter((t) => !t._from);
console.log(`WS live trade updates: ${upd.length} | WS snapshot rows: ${wsTrades.length - upd.length} | REST /trades rows: ${rest.length}\n`);

const fmt = (o) => JSON.stringify(o);
let paired = 0;
console.log("=== live WS trade vs the REST row with the same timestamp ===");
for (const w of upd) {
  const sameTs = rest.filter((t) => Number(t.timestamp) === Number(w.timestamp));
  if (!sameTs.length) { console.log(`\n  ws ${fmt(w)}\n     -> no REST row with ts=${w.timestamp} in the latest ${rest.length}`); continue; }
  for (const r of sameTs) {
    paired++;
    const idMatch = String(r.id) === String(w.id);
    console.log(`\n  pair ${paired}  ts=${w.timestamp}  id match: ${idMatch ? "YES" : "NO"}`);
    console.log(`    ws   id=${w.id}  ${w.side} ${w.quantity} @ ${w.price}   keys: ${Object.keys(w).sort().join(",")}`);
    console.log(`    rest id=${r.id}  ${r.side} ${r.amount} @ ${r.price}   keys: ${Object.keys(r).sort().join(",")}`);
    const tsRivals = sameTs.length;
    if (tsRivals > 1) console.log(`    (note: ${tsRivals} REST rows share this timestamp)`);
  }
}

const wsIds = new Set(upd.map((t) => String(t.id)));
const restIds = new Set(rest.map((t) => String(t.id)));
console.log(`\n=== summary ===`);
console.log(`trades paired by timestamp: ${paired}/${upd.length}`);
console.log(`of those, id strings equal: ${upd.filter((w) => rest.some((r) => Number(r.timestamp) === Number(w.timestamp) && String(r.id) === String(w.id))).length}`);
console.log(`any WS trade id present anywhere in the REST page: ${upd.filter((t) => restIds.has(String(t.id))).length}/${upd.length}`);
console.log(`any REST trade id present in the WS stream: ${rest.filter((t) => wsIds.has(String(t.id))).length}/${rest.length}`);
console.log(`timestamp collisions inside the REST page: ${rest.length - new Set(rest.map((t) => t.timestamp)).size} of ${rest.length}`);
console.log(`ws id shape example : ${upd[0]?.id}`);
console.log(`rest id shape example: ${rest[0]?.id}`);
const doc = await (await fetch(`${REST}/markets`)).json();
console.log(`\n(other surfaces for reference: /markets returns ${doc.markets?.length} markets) -> does any REST row carry a "-0" style id? ${rest.some((t) => /-\d+$/.test(String(t.id)))}`);
