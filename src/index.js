import { NETWORKS, restGet, resolveEnvs } from "./rest.js";
import { runChecks } from "./checks.js";

function parseArgs(argv) {
  const args = { env: "shannon", json: false, market: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--env") args.env = argv[++i];
    else if (a === "--market") args.market = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

const HELP = `dreamDEX market-data auditor (read-only)

  node src/index.js [--env mainnet|shannon|both] [--market SOMI:USDso] [--json]

Uses first-party surfaces and compares them:
  - the REST API      ${NETWORKS.shannon.rest}
  - the Markets SDK   @somnia-chain/markets-sdk (indexer + chain RPC)
  - the WebSocket feed (public channels: orderbook, ohlcv)

No keys, no signatures, no writes. Node >= 21 (global fetch + WebSocket).
`;

async function defaultMarket(net) {
  const r = await restGet(net, "/markets");
  return r.json?.markets?.[0]?.symbol ?? null;
}

const out = (...l) => console.log(...l);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    out(HELP);
    return;
  }
  const envs = resolveEnvs(args.env);
  const report = [];

  for (const net of envs) {
    const n = NETWORKS[net];
    const market = args.market ?? (await defaultMarket(net));
    if (!args.json) {
      out("");
      out(`################ ${net} — ${n.label} (chainId ${n.chainId})`);
      out(`################ REST ${n.rest}`);
    }
    const results = await runChecks(net, market);
    report.push({ env: net, chainId: n.chainId, market, results });
    if (!args.json) {
      for (const r of results) {
        out("");
        out(`--- ${r.name}  [${r.ok ? "OK" : "CHECK"}]  ${r.summary}`);
        for (const line of r.rows) out(`      ${line}`);
      }
    }
  }

  if (args.json) out(JSON.stringify(report, null, 2));
  out("");
  out(`audited: ${envs.join(", ")}  (read-only; no credentials used)`);
}

main().catch((e) => {
  console.error(`audit failed: ${e?.message ?? e}`);
  process.exit(1);
});
