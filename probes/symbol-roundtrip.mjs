// Does the SDK's own symbol round-trip? Which form does REST accept for a PERP market?
import * as viemChains from "viem/chains";
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";

const STG = "https://stg.api.dreamdex.io/v0";
const MAIN = "https://api.dreamdex.io/v0";

const ex = new SomniaMarkets({
  chain: viemChains.somniaTestnet,
  indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
  wsRpcUrl: "wss://api.infra.testnet.somnia.network/ws",
  addresses: SOMNIA_TESTNET_ADDRESSES,
});
const mk = await ex.fetchMarkets();
const perp = mk.find((m) => m.type === "swap");
const spot = mk.find((m) => m.type === "spot");
console.log("chosen perp:", perp.symbol, "| spot:", spot.symbol);

const cands = [
  perp.symbol,                                  // SWSOL/USDso:USDso  (SDK form)
  `${perp.base}:${perp.quote}`,                 // SWSOL:USDso        (REST id form)
  `${perp.base}/${perp.quote}`,                 // SWSOL/USDso        (CCXT form)
];

console.log("\n=== REST /markets/<id>/tickers (stg) ===");
for (const c of cands) {
  const r = await fetch(`${STG}/markets/${encodeURIComponent(c)}/tickers`);
  const t = (await r.text()).replace(/\s+/g, " ").slice(0, 160);
  console.log(`  ${c.padEnd(20)} -> ${r.status} ${t}`);
}
console.log("\n=== REST /orderbooks?symbols= (stg) ===");
for (const c of cands) {
  const r = await fetch(`${STG}/orderbooks?symbols=${encodeURIComponent(c)}`);
  const t = (await r.text()).replace(/\s+/g, " ").slice(0, 160);
  console.log(`  ${c.padEnd(20)} -> ${r.status} ${t}`);
}

console.log("\n=== SDK fetchOrderBook with each form (stg indexer) ===");
for (const c of cands) {
  try {
    const ob = await ex.fetchOrderBook(c);
    console.log(`  ${c.padEnd(20)} -> OK bids=${ob.bids?.length ?? "-"} asks=${ob.asks?.length ?? "-"} px=${JSON.stringify(ob.bids?.[0] ?? null)}`);
  } catch (e) {
    console.log(`  ${c.padEnd(20)} -> ERR ${String(e.message || e).slice(0, 90)}`);
  }
}

console.log("\n=== REST /markets kind values + any perp rows (both bases) ===");
for (const base of [STG, MAIN]) {
  const j = await (await fetch(`${base}/markets`)).json();
  const kinds = {};
  for (const m of j.markets) kinds[m.kind ?? "?"] = (kinds[m.kind ?? "?"] || 0) + 1;
  console.log(`  ${base}: n=${j.markets.length} kinds=${JSON.stringify(kinds)} ids=${j.markets.map((m) => m.id).join(",")}`);
  const one = j.markets[0];
  console.log(`     sample keys: ${Object.keys(one).join(",")}`);
}
try { await ex.close?.(); } catch {}
