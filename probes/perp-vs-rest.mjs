// Are the perp markets the SDK sees reachable through the documented REST API?
import * as viemChains from "viem/chains";
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";

const REST = "https://stg.api.dreamdex.io/v0";
const ex = new SomniaMarkets({
  chain: viemChains.somniaTestnet,
  indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
  wsRpcUrl: "wss://api.infra.testnet.somnia.network/ws",
  addresses: SOMNIA_TESTNET_ADDRESSES,
});

const mk = await ex.fetchMarkets();
const byType = {};
for (const m of mk) byType[m.type ?? "?"] = (byType[m.type ?? "?"] || 0) + 1;
console.log("SDK market count by type:", JSON.stringify(byType));

const perps = mk.filter((m) => (m.type ?? "").toLowerCase().includes("perp"));
console.log("\nperp markets:", perps.length);
for (const p of perps.slice(0, 5)) {
  console.log("   symbol=", JSON.stringify(p.symbol), "base=", JSON.stringify(p.base), "quote=", JSON.stringify(p.quote), "id=", String(p.id).slice(0, 20));
}

// what does REST think the universe is?
const restMk = await (await fetch(`${REST}/markets`)).json();
console.log("\nREST /v0/markets:", restMk.markets.length, "kinds:", [...new Set(restMk.markets.map((m) => m.kind))].join(","));
for (const q of ["?kind=perp", "?type=perp", "?marketType=perp", "?include=perp"]) {
  const r = await fetch(`${REST}/markets${q}`);
  const j = await r.json().catch(() => null);
  console.log(`  /markets${q.padEnd(20)} -> ${r.status} count=${j?.markets?.length ?? "-"} kinds=${[...new Set((j?.markets || []).map((m) => m.kind))].join(",")}`);
}

// ask REST directly about a perp the SDK says exists
console.log("\nREST lookups for SDK perp markets:");
for (const p of perps.slice(0, 3)) {
  const rid = `${p.base}:${p.quote}`;
  const clean = rid.replace(/:USDso$/, ":USDso"); // collapse a doubled quote if present
  for (const sym of [...new Set([rid, clean])]) {
    const t = await fetch(`${REST}/markets/${encodeURIComponent(sym)}/tickers`);
    const tb = await t.text();
    const o = await fetch(`${REST}/orderbooks?symbols=${encodeURIComponent(sym)}`);
    console.log(`  "${sym}" -> /tickers ${t.status} ${tb.replace(/\s+/g, " ").slice(0, 95)}`);
    console.log(`  ${" ".repeat(sym.length)}   /orderbooks ${o.status}`);
  }
}
try { await ex.close?.(); } catch {}
