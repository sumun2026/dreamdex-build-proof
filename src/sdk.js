import * as viemChains from "viem/chains";
import {
  SomniaMarkets,
  SOMNIA_MAINNET_ADDRESSES,
  SOMNIA_TESTNET_ADDRESSES,
} from "@somnia-chain/markets-sdk";
import { NETWORKS } from "./rest.js";

const ADDRESS_TABLE = {
  SOMNIA_MAINNET_ADDRESSES,
  SOMNIA_TESTNET_ADDRESSES,
};

const CHAIN_TABLE = {
  somnia: viemChains.somnia,
  somniaTestnet: viemChains.somniaTestnet,
};

export function sdkConfig(net) {
  const n = NETWORKS[net];
  const chain = CHAIN_TABLE[n.chainKey];
  if (!chain) throw new Error(`viem/chains.${n.chainKey} is not exported by this viem version`);
  return {
    chain,
    indexerUrl: n.indexerUrl,
    wsRpcUrl: n.wsRpcUrl,
    addresses: ADDRESS_TABLE[n.addresses],
  };
}

export function createExchange(net) {
  return new SomniaMarkets(sdkConfig(net));
}

// A REST market id ("SOMI:USDso") is not an SDK symbol. The SDK speaks CCXT: spot is BASE/QUOTE and
// a linear perp is BASE/QUOTE:SETTLE. This is the mapping the auditor needs in order to compare the
// two surfaces against the same market.
export function restIdToCcxtSymbol(restId) {
  const [base, quote] = restId.split(":");
  return `${base}/${quote}`;
}

export function findSdkMarket(markets, restId) {
  const unified = restIdToCcxtSymbol(restId);
  return markets.find((m) => m.symbol === unified) ?? null;
}
