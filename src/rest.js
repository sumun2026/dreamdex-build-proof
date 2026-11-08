export const NETWORKS = {
  mainnet: {
    chainId: 5031,
    label: "Somnia mainnet",
    rest: "https://api.dreamdex.io/v0",
    ws: "wss://api.dreamdex.io/v0/ws/public",
    indexerUrl: "https://prd.smk.somnia.host/v1/graphql",
    wsRpcUrl: "wss://api.infra.mainnet.somnia.network/ws",
    addresses: "SOMNIA_MAINNET_ADDRESSES",
    chainKey: "somnia",
  },
  shannon: {
    chainId: 50312,
    label: "Somnia Shannon testnet",
    rest: "https://stg.api.dreamdex.io/v0",
    ws: "wss://stg.api.dreamdex.io/v0/ws/public",
    indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
    wsRpcUrl: "wss://api.infra.testnet.somnia.network/ws",
    addresses: "SOMNIA_TESTNET_ADDRESSES",
    chainKey: "somniaTestnet",
  },
};

export function resolveEnvs(flag) {
  if (flag === "both") return ["mainnet", "shannon"];
  if (NETWORKS[flag]) return [flag];
  throw new Error(`unknown --env "${flag}" (mainnet | shannon | both)`);
}

// Every response carries status/headers plus both parsed and raw bodies, because half of what this
// tool checks is the difference between what the API sends and what the docs say it sends.
export async function request(url, { headers = {}, timeoutMs = 20000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, signal: ac.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON responses are a result, not an error, here */
    }
    return {
      url,
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      json,
      text,
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export const restGet = (net, path, query = "") =>
  request(`${NETWORKS[net].rest}${path}${query}`);

export function symbolsQuery(symbols) {
  return symbols.map((s) => `symbols=${encodeURIComponent(s)}`).join("&");
}

export const shortText = (r, n = 110) => r.text.replace(/\s+/g, " ").trim().slice(0, n);
