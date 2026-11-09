import fs from "node:fs";
const URLS = {
  mainnet: "wss://api.dreamdex.io/v0/ws/public",
  testnet: "wss://stg.api.dreamdex.io/v0/ws/public",
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(url, script) {
  const got = [];
  const log = [];
  await new Promise((resolve) => {
    const ws = new WebSocket(url);
    let done = false;
    const finish = (why) => {
      if (done) return;
      done = true;
      log.push(`  [closed] ${why} code=${ws.code ?? "-"} reason=${ws.reason ?? "-"}`);
      try { ws.close(); } catch {}
      resolve();
    };
    ws.addEventListener("open", async () => {
      log.push("  [open] connected");
      for (const step of script) {
        if (step.delay) await wait(step.delay);
        if (step.note) log.push(`  --- ${step.note}`);
        if (step.raw !== undefined) {
          ws.send(step.raw);
          log.push(`  >> raw ${JSON.stringify(step.raw).slice(0, 90)}`);
        } else {
          ws.send(JSON.stringify(step.send));
          log.push(`  >> ${JSON.stringify(step.send).slice(0, 140)}`);
        }
        await wait(step.after ?? 900);
      }
      finish("script end");
    });
    ws.addEventListener("message", (e) => {
      got.push(e.data);
      const s = String(e.data).replace(/\s+/g, " ");
      log.push(`  << ${s.slice(0, 220)}${s.length > 220 ? " …" : ""}`);
    });
    ws.addEventListener("error", (e) => log.push(`  [error] ${e.message ?? e.type}`));
    ws.addEventListener("close", (e) => finish(`code ${e.code}`));
    setTimeout(() => finish("hard timeout 90s"), 90000);
  });
  return { log, got };
}

const out = {};
for (const [name, url] of Object.entries(URLS)) {
  console.log(`\n######## ${name}  ${url}`);
  const { log, got } = await session(url, [
    { note: "1. documented heartbeat: {\"operation\":\"ping\"} -> pong", send: { operation: "ping" } },
    { note: "2. documented REST-over-WS request shape", send: { id: 1, operation: "getMarkets", params: { symbol: "SOMI:USDso" } } },
    { note: "3. docs: operation is CASE-INSENSITIVE", send: { id: 2, operation: "GETMARKETS" } },
    { note: "4. docs example error: unknown operation", send: { id: 3, operation: "invalidOp" } },
    { note: "5. docs: missing operation -> invalid_request", send: { id: 4 } },
    { note: "6. docs: unparseable JSON -> invalid_request", raw: "notjson" },
    { note: "7. docs: id is REQUIRED (integer) - omit it", send: { operation: "getMarkets" } },
    { note: "8. documented subscribe, correct array form", send: { operation: "subscribe", channel: "orderbook", params: { symbols: ["SOMI:USDso"] } }, after: 1500 },
    { note: "9. cross-check finding 1 over WS: comma-joined single string", send: { operation: "subscribe", channel: "orderbook", params: { symbols: ["SOMI:USDso,WETH:USDso"] } }, after: 1500 },
    { note: "10. subscribe to a channel the docs do not name", send: { operation: "subscribe", channel: "nonexistent" }, after: 1200 },
  ]);
  log.forEach((l) => console.log(l));
  out[name] = { url, messages: got.map((g) => String(g).slice(0, 4000)) };
}
fs.writeFileSync("probe-ws.json", JSON.stringify(out, null, 2));
console.log("\nmessages:", Object.entries(out).map(([k, v]) => `${k}=${v.messages.length}`).join(" "));
