// Step 1: prove one real read through @somnia-chain/markets-sdk, exactly as their
// "How to configure the SDK" guide documents it. Public reads only, no key, no signer.
import * as viemChains from "viem/chains";
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES, SOMNIA_MAINNET_ADDRESSES } from "@somnia-chain/markets-sdk";

console.log("viem version:", await import("viem/package.json", { with: { type: "json" } }).then((m) => m.default.version).catch(() => "?"));
for (const name of ["somniaTestnet", "somnia", "somniaShannon", "somniaMainnet"]) {
  const c = viemChains[name];
  console.log(`  viem/chains.${name}:`, c ? `present (id=${c.id}, name=${c.name})` : "ABSENT");
}

async function attempt(label, cfg, call) {
  console.log(`\n#### ${label}`);
  let ex;
  try {
    ex = new SomniaMarkets(cfg);
  } catch (e) {
    console.log("  constructor FAILED:", e?.name, "|", String(e?.message).slice(0, 220));
    return;
  }
  try {
    const r = await call(ex);
    console.log("  OK:", JSON.stringify(r, (k, v) => (typeof v === "bigint" ? String(v) : v))?.slice(0, 420));
  } catch (e) {
    console.log("  read FAILED:", e?.name ?? "Error", "|", String(e?.message).slice(0, 300));
  } finally {
    try { await ex.close?.(); } catch {}
  }
}

const docShannon = {
  indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
  chain: viemChains.somniaTestnet,
  wsRpcUrl: "wss://api.infra.testnet.somnia.network/ws",
  addresses: SOMNIA_TESTNET_ADDRESSES,
};
await attempt("doc example verbatim (Shannon, dev indexer)", docShannon, async (ex) => {
  const m = await ex.fetchMarkets();
  return { count: m.length, first: m[0] && { symbol: m[0].symbol, id: m[0].id } };
});

const shannonPrd = { ...docShannon, indexerUrl: "https://prd.smk.somnia.host/v1/graphql" };
await attempt("same, but prd indexer", shannonPrd, async (ex) => {
  const m = await ex.fetchMarkets();
  return { count: m.length, first: m[0] && { symbol: m[0].symbol, id: m[0].id } };
});

await attempt("fetchOrderBook on whichever worked", shannonPrd, async (ex) => {
  const m = await ex.fetchMarkets();
  const sym = m[0]?.symbol;
  const b = await ex.fetchOrderBook(sym, { limit: 3 });
  return { symbol: sym, bids: b.bids?.slice(0, 2), asks: b.asks?.slice(0, 2) };
});
