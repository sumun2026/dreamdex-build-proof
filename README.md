# dreamdex-build-proof

A small, read-only **market-data auditor** for [dreamDEX](https://dreamdex.io). It calls the same
market through two first-party surfaces — the **REST HTTP API** and the **`@somnia-chain/markets-sdk`**
TypeScript SDK — plus the **WebSocket feed**, and prints where they agree and where they don't.

No API keys, no wallet, no signatures, no writes. Everything here is `GET` and public `read`
operations against public endpoints.

## What this repository contains

**`src/`** — a read-only market-data auditor for dreamDEX, built with the official
`@somnia-chain/markets-sdk` plus the REST API and the WebSocket feed. It runs seven checks against both
environments and prints where the three first-party surfaces agree and where they don't.

**`probes/`** and **`feedback/`** — added later, when this repository is used as a bounty submission; see
`BOUNTY.md`. The auditor is what produced several of those items and still reproduces them on demand.

## Why the auditor exists

Integrating a DEX means reconciling identifiers and units across surfaces that each document
themselves but rarely each other. dreamDEX has three:

| Surface | Base | Identifier style |
|---|---|---|
| REST HTTP API | `https://api.dreamdex.io/v0` (mainnet, chain `5031`), `https://stg.api.dreamdex.io/v0` (Shannon, `50312`) | `BASE:QUOTE` market ids, e.g. `SOMI:USDso` |
| Markets SDK | `@somnia-chain/markets-sdk` → Somnia Markets indexer (`prd.smk.somnia.host` / `dev.smk.somnia.host`) | CCXT unified symbols: `SOMI/USDso`, and `BASE/QUOTE:SETTLE` for linear perps, e.g. `SWSOL/USDso:USDso` |
| WebSocket feed | `wss://api.dreamdex.io/v0/ws/public` | REST-style `SOMI:USDso` inside `params.symbols` |

This tool pins those differences down with live output instead of inference.

## Setup

```sh
npm install
node src/index.js --env both
```

Requires **Node >= 21** (uses the global `fetch` and `WebSocket`; no polyfills, no build step).

```
node src/index.js [--env mainnet|shannon|both] [--market SOMI:USDso] [--json]
```

`--json` emits the whole report as structured output for diffing between runs.

## What each check does

| Check | Question it answers |
|---|---|
| **market universe** | How many markets does each surface expose, and what kinds? REST is spot-only by design; the Somnia indexer also carries `binary` and `swap`/`PERP` markets, so perp data comes from the SDK, not `/v0/markets`. |
| **identifier mapping** | Can a REST market id be resolved to an SDK market, and does an SDK symbol round-trip back into REST? (It does not — the SDK's perp form carries a `:SETTLE` suffix REST has never heard of.) |
| **order book agreement** | Do the REST order book and the SDK order book report the same top of book at the same instant? Levels are normalised first: REST returns `{price, quantity}` objects, the SDK returns CCXT `[price, quantity]` pairs. |
| **volume window unit** | `/markets/{id}/volume` takes `since`/`until`. The same 24-hour window is requested once in **milliseconds** and once in **seconds**. A seconds caller gets HTTP **200** and a volume of **0**, not an error. |
| **error contract** | Handler-raised errors return the documented JSON `{status, name, description}` plus an `Error-Name` header. Router-level 404s return `text/plain`. Both are exercised. |
| **candle cross-surface** | Diffs **every** daily bar of `/markets/{id}/candles?interval=1d` against the WS `ohlcv` snapshot, then asks `/volume` for each disagreeing day. Also shows that `limit` is accepted and ignored. |
| **websocket feed** | Connects, `ping`, `getMarkets`, `subscribe` to `orderbook`, and separately probes what happens when the request omits the `id` the operations page marks required. |

## The candle check reports `[CHECK]`, not `[OK]`

On live data this row exits as `[CHECK]` — it disagrees with itself across surfaces, which is what the
check exists to detect. Sample, mainnet:

```
--- candle cross-surface  [CHECK]  1/98 daily bars disagree across surfaces
      GET /markets/SOMI%3AUSDso/candles?interval=1d          -> 200 98 bars (2026-08-06 .. 2026-11-11)
        + &limit=400                  -> 200 98 bars — limit is accepted and ignored, so the window cannot be widened
      WS ohlcv timeframe=1d (singular symbol param) -> 100 bars (2026-08-04 ..)
      daily bars compared 98 | in REST only (older than the WS window) 0 | disagreeing 1
```

(That sample is from `node src/index.js --env mainnet` on 2026-11-11, kept in
`probes/auditor-run-20261111-mainnet.log`; the earlier 2026-11-08 run of the same command read 94 bars and
the same single disagreeing day. Bar counts grow as the window ages — the disagreeing day does not move.)

That is the auditor working, not a broken build: same symbol, same UTC day, same units, three first-party
surfaces. The check is deliberately **informational** — it prints the disagreement and stops there, and
the still-open current day is excluded by design (`/volume` rejects windows newer than 30 minutes, and a
live WS bar legitimately moves ahead of REST). Run it yourself before believing anything about it.
`--market SOMI:USDso` changes which market is diffed; every option is read-only.

## Sample output (Shannon, 2026-11-08)

```
################ shannon — Somnia Shannon testnet (chainId 50312)

--- market universe  [OK]  both surfaces answered
      REST /v0/markets      : 3 markets, kinds {"spot":3}
      SDK  fetchMarkets()   : 49 markets, types {"binary":22,"swap":24,"spot":3}
      PERP markets          : SDK/indexer 24 | REST 0

--- identifier mapping  [OK]  3/3 REST markets resolvable through the SDK
      SOMI:USDso       -> CCXT SOMI/USDso       -> SDK match (type=spot)
      SDK symbols with a :SETTLE suffix: 24 of 49 (CCXT linear-perp notation, e.g. SWSOL/USDso:USDso)

--- order book agreement  [OK]  compared; see rows
      REST /orderbooks?symbols=SOMI:USDso -> 200
        best bid {"price":"0.1645","quantity":"1197.9"} / best ask {"price":"0.1647","quantity":"455.5"}
      SDK fetchOrderBook("SOMI/USDso") -> ok
        best bid {"price":"0.1646","quantity":"544.5"} / best ask {"price":"0.1647","quantity":"455.5"}
        verdict: surfaces disagree — compare the two lines above

--- volume window unit  [OK]  documented behaviour of /volume
      milliseconds  since=1793992351000 -> 200 baseVolume 201155.31
      seconds       since=1793992351    -> 200 baseVolume 0
```

> On the book check: the two surfaces are polled **sequentially**, not atomically, and they are
> served from different paths (REST engine vs indexer/SDK). On mainnet they matched exactly; on
> Shannon above they differ by one tick on the bid. That is *not* evidence of a defect — it is what
> a live order book looks like when you read it twice. Treat a single disagreement as inconclusive,
> re-run a few times, and look at the request latency before concluding anything. The check is
> informational by design.

## Configuration notes learned while building this

- **Chain and indexer must be paired.** Mainnet is `viem/chains.somnia` + `prd.smk.somnia.host`;
  Shannon is `viem/chains.somniaTestnet` (id `50312`) + `dev.smk.somnia.host`. The SDK exports no
  chain named "Tokyo".
- **The SDK needs `loadMarkets()` before symbol-based calls.** `fetchOrderBook("SOMI/USDso")` throws
  `unknown symbol … — call loadMarkets() first` on a fresh client even though `fetchMarkets()` works.
- **`symbols` is a repeated query key, not a comma list.** `?symbols=A&symbols=B` works;
  `?symbols=A,B` is rejected as one malformed symbol. Helper: `symbolsQuery()` in `src/rest.js`.
- **WebSocket subscribe params are not one shape.** `ohlcv` takes a singular string
  (`params: { symbol: "SOMI:USDso", timeframe: "1d" }`) while `trades` and `orderbook` take an array
  (`params: { symbols: ["SOMI:USDso"] }`). Send the wrong one and the server answers
  `subscription_failed` for that channel — which reads like a broken channel but is a broken request.
  Checked in `probes/ws-live-update-1111.mjs` and `probes/trade-id-cross-surface.mjs`.
- **`since`/`until` are milliseconds.** Nothing in the HTTP docs says so; the auditor prints the
  difference rather than assuming the reader knows.
- **Docs live on `app.dreamdex.io`.** `https://dreamdex.io/docs/...` returns `404`; each page also has a
  raw markdown mirror at the same path with `.md` appended, which is what the evidence captures under
  `probes/docmd-20261112-*.md` were fetched from.
- **Perp markets are not in the REST API.** Not a bug — the market-data page enumerates a spot-only
  `{symbol}` universe. It does mean a perp integration has to go through the SDK or the indexer.

## Layout

```
BOUNTY.md      why this repo exists as a submission, and where the reports live
src/index.js   CLI, argument parsing, report printing
src/rest.js    endpoint table, request helper, symbols query builder
src/sdk.js     Markets SDK client factory + REST-id -> CCXT-symbol mapping
src/checks.js  the seven checks
```

## Limitations

- Read-only: no authenticated endpoints, so orders, stops, balances and portfolio are not covered.
- The auditor in `src/` exercises the WebSocket `ohlcv` channel at the **snapshot**; the `trades` and
  `order` channels are not subscribed by `src/index.js`, and its live update frames are not compared
  against REST. That comparison does exist, but as one-shot scripts: `probes/ws-live-update-1111.mjs`
  (REST-vs-live frame parity over a timed watch, with a control run) and
  `probes/trade-id-cross-surface.mjs` (report 09 — id formats and timestamp collisions).
- The candle check is daily-bar only and covers the market given on the command line (`--market`), not
  every interval for every market.
- Book comparison is a point-in-time top-of-book match, not a depth reconciliation. Two surfaces
  polled a second apart can legitimately differ; re-run before drawing a conclusion from one sample.
- Nothing is asserted about on-chain contract behaviour.
