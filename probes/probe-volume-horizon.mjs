// /volume echoes back the window it actually served. When we ask for an older window, does it
// serve what we asked, or silently substitute its default and report the substituted window?
import { request, restGet, NETWORKS } from "./rest.js";

const B = NETWORKS.mainnet.rest;
const MKT = "SOMI:USDso";
const DAY = 86400000;
const now = Date.now();
const iso = (ms) => (Number.isFinite(Number(ms)) ? new Date(Number(ms)).toISOString().slice(0, 16) : "(none)");

console.log("asked window vs served window (until is always 40min ago to satisfy the 30-min rule)\n");
const rows = [];
for (const back of [1, 5, 20, 30, 40, 60, 80, 90, 93, 94, 95, 100, 120, 200]) {
  const until = now - 40 * 60_000;
  const since = until - back * DAY;
  const r = await restGet("mainnet", `/markets/${encodeURIComponent(MKT)}/volume`, `?since=${since}&until=${until}`);
  const j = r.json ?? {};
  const echoSince = j.since, echoUntil = j.until;
  const honored = Number(echoSince) === Number(since) && Number(echoUntil) === Number(until);
  const servedSpan = echoSince && echoUntil ? (Number(echoUntil) - Number(echoSince)) / DAY : null;
  rows.push({ back, status: r.status, honored, baseVolume: j.baseVolume, servedSpan });
  console.log(
    `asked ${String(back).padStart(3)}d  ${iso(since)} .. ${iso(until)}` +
    ` -> ${r.status} name=${j.name ?? "-"} honored=${honored ? "YES" : "NO "}` +
    ` served ${servedSpan === null ? "-" : servedSpan.toFixed(2) + "d"} baseVol=${j.baseVolume ?? "-"}` +
    `${honored ? "" : `  (echo since=${echoSince} until=${echoUntil} = ${iso(echoSince)}..${iso(echoUntil)})`}`
  );
}

console.log("\n=== the substitution, isolated ===");
const oldest = rows.find((r) => !r.honored && r.status === 200);
if (oldest) {
  console.log(`first un-honoured request: asked ${oldest.back}d ago, status ${oldest.status}, served ${oldest.servedSpan?.toFixed(2)}d`);
  const until = now - 40 * 60_000;
  const good = await restGet("mainnet", `/markets/${encodeURIComponent(MKT)}/volume`, `?since=${until - 20 * DAY}&until=${until}`);
  const bad = await restGet("mainnet", `/markets/${encodeURIComponent(MKT)}/volume`, `?since=${until - oldest.back * DAY}&until=${until}`);
  console.log(`  20d-ago window  -> baseVolume ${good.json.baseVolume} (served ${((good.json.until - good.json.since) / DAY).toFixed(2)}d)`);
  console.log(`  ${oldest.back}d-ago window -> baseVolume ${bad.json.baseVolume} (served ${((bad.json.until - bad.json.since) / DAY).toFixed(2)}d)`);
  console.log(`  identical answer to a different question? ${good.json.baseVolume === bad.json.baseVolume ? "YES" : "no"}`);
  const def = await request(`${B}/markets/${encodeURIComponent(MKT)}/volume`);
  console.log(`  no-params default -> baseVolume ${def.json.baseVolume} served ${((def.json.until - def.json.since) / DAY).toFixed(2)}d  ` +
    `(matches substituted answer: ${def.json.baseVolume === bad.json.baseVolume})`);
}

console.log("\n=== does /candles have the same horizon? oldest bar per interval ===");
for (const iv of ["1m", "1h", "4h", "1d"]) {
  const c = await request(`${B}/markets/${encodeURIComponent(MKT)}/candles?interval=${iv}`);
  const cs = c.json?.candles ?? [];
  console.log(`  interval=${iv.padEnd(3)} n=${String(cs.length).padStart(4)} oldest=${cs.length ? iso(cs[0].timestamp) : "-"} newest=${cs.length ? iso(cs[cs.length - 1].timestamp) : "-"}`);
}
console.log("\n=== and asking /candles for an explicit old range (are from/to/limit accepted at all?) ===");
for (const q of ["?interval=1d&limit=200", "?interval=1d&from=1785000000000", "?interval=1d&since=1785000000000&until=1786000000000", "?interval=1d&max=200"]) {
  const r = await request(`${B}/markets/${encodeURIComponent(MKT)}/candles${q}`);
  console.log(`  ${q.padEnd(52)} -> ${r.status} ${r.headers["error-name"] || "-"} n=${r.json?.candles?.length ?? "-"} | ${r.status !== 200 ? r.text.replace(/\s+/g, " ").slice(0, 100) : ""}`);
}
