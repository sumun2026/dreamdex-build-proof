// Where does "SWSOL/USDso:USDso" come from: indexer fields, or SDK symbol synthesis?
import * as viemChains from "viem/chains";
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";

const cfg = {
  chain: viemChains.somniaTestnet,
  indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
  wsRpcUrl: "wss://api.infra.testnet.somnia.network/ws",
  addresses: SOMNIA_TESTNET_ADDRESSES,
};
const ex = new SomniaMarkets(cfg);
const mk = await ex.fetchMarkets();

const swaps = mk.filter((m) => m.type === "swap");
console.log("=== SDK 'swap' markets (perps), first 3, full object ===");
for (const m of swaps.slice(0, 3)) console.log(JSON.stringify(m, null, 1));

console.log("\n=== quote/base field audit across all 49 ===");
const bad = [];
for (const m of mk) {
  const b = String(m.base ?? "");
  const q = String(m.quote ?? "");
  const s = String(m.symbol ?? "");
  if (q.includes(":") || q.includes("/") || s.split(/[:/]/).length > 3) bad.push({ type: m.type, base: b, quote: q, symbol: s });
}
console.log("markets with a dirty quote or >3 symbol segments:", bad.length);
for (const m of bad.slice(0, 6)) console.log("   ", JSON.stringify(m));

// go under the SDK and ask the indexer directly what the row looks like
const gql = `query { markets(where:{limit:60}) { id symbol baseAsset { symbol } quoteAsset { symbol } marketType } }`;
const r = await fetch(cfg.indexerUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ query: gql }),
});
const txt = await r.text();
console.log("\n=== raw GraphQL markets query ===", r.status);
console.log(txt.slice(0, 1400));
try { await ex.close?.(); } catch {}
