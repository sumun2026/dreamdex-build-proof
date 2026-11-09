// Compare the SAME market's identifier across three first-party surfaces:
//   REST API id  |  Markets SDK unified symbol  |  CCXT adapter symbol
// Correct chain<->indexer pairing per their own "configure for a network" guide.
import * as viemChains from "viem/chains";
import {
  SomniaMarkets,
  SOMNIA_TESTNET_ADDRESSES,
  SOMNIA_MAINNET_ADDRESSES,
} from "@somnia-chain/markets-sdk";

const REST = {
  mainnet: "https://api.dreamdex.io/v0",
  testnet: "https://stg.api.dreamdex.io/v0",
};

const NETS = {
  mainnet: {
    chain: viemChains.somnia,
    indexerUrl: "https://prd.smk.somnia.host/v1/graphql",
    wsRpcUrl: "wss://api.infra.mainnet.somnia.network/ws",
    addresses: SOMNIA_MAINNET_ADDRESSES,
  },
  testnet: {
    chain: viemChains.somniaTestnet,
    indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
    wsRpcUrl: "wss://api.infra.testnet.somnia.network/ws",
    addresses: SOMNIA_TESTNET_ADDRESSES,
  },
};

for (const [label, cfg] of Object.entries(NETS)) {
  console.log(`\n########## ${label.toUpperCase()}  chainId=${cfg.chain.id}`);

  const rest = await (await fetch(`${REST[label]}/markets`)).json();
  const restIds = rest.markets.map((m) => m.symbol);
  console.log("REST /v0/markets ids      :", restIds.join(", "));

  const ex = new SomniaMarkets(cfg);
  try {
    const mk = await ex.fetchMarkets();
    console.log("SDK fetchMarkets count    :", mk.length);
    const spot = mk.filter((m) => (m.type ?? m.kind ?? m.marketType ?? "") .toString().toLowerCase().includes("spot") || /USDso/.test(m.symbol));
    const sample = mk.slice(0, 6).map((m) => ({
      symbol: m.symbol,
      id: String(m.id).slice(0, 14) + "…",
      type: m.type ?? m.kind ?? m.marketType,
      base: m.base ?? m.baseAsset?.symbol ?? m.baseAssetId,
      quote: m.quote ?? m.quoteAsset?.symbol ?? m.quoteAssetId,
    }));
    console.log("SDK first 6 unified symbols:");
    for (const s of sample) console.log("   ", JSON.stringify(s));

    const doubled = mk.map((m) => m.symbol).filter((s) => (s.match(/:/g) || []).length > 0 && s.includes("/"));
    console.log("SDK symbols containing BOTH '/' and ':' :", doubled.length, "of", mk.length);
    if (doubled.length) console.log("   e.g.", doubled.slice(0, 8).join(", "));

    for (const rid of restIds) {
      const unifiedFromRest = rid.replace(":", "/");
      const hit = mk.find((m) => m.symbol === unifiedFromRest);
      const alt = mk.find((m) => m.symbol && m.symbol.startsWith(unifiedFromRest.split("/")[0] + "/"));
      console.log(
        `  ${rid.padEnd(14)} CCXT-doc form "${unifiedFromRest}" -> SDK match: ${hit ? "YES" : "no"}; nearest SDK symbol: ${alt ? alt.symbol : "-"}`
      );
    }
  } catch (e) {
    console.log("  SDK read failed:", e?.name, String(e?.message).slice(0, 200));
  } finally {
    try { await ex.close?.(); } catch {}
  }
}
