# dreamDEX Perps Builder Bounty — submission notes

Repository submitted for the **Feedback track** of the
[dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty) on DoraHacks
(submission deadline `2026-11-15T14:30:00.000Z`).

`feedback/` holds one Markdown file per issue, as the track requires. `probes/` holds the scripts and
raw logs that reproduce them. `src/` is the three-way market-data cross-check (REST vs Markets SDK vs
WebSocket) that surfaced several of them.

Everything was found through **public, unauthenticated reads**. No private keys, no signatures, no
orders, no writes to any endpoint. Nothing here is a security vulnerability, so per the bounty rules it
belongs in this repository rather than in `security@dreamdex.io`.

## The eight items

| # | Severity | Area | Summary |
|---|---|---|---|
| 01 | major | docs | The docs' own `# Wrong` example promises `200` + `[]` for a bad `symbols` value; the API answers `400 invalid_param`. |
| 02 | major | API, docs | `/volume`'s `since`/`until` unit is never documented; a caller passing seconds gets **HTTP 200 with volume 0**, not an error. |
| 03 | normal | API | "All error responses are JSON + `Error-Name`" does not hold for router-level 404s (`text/plain`, no header). |
| 04 | major | docs | Every CCXT example uses `SOMI/USDC`; no `USDC` currency exists on this venue — the quote is always `USDso`. |
| 05 | normal | API, docs | The WebSocket `id` field is documented `Required: yes`; omitting it executes the operation and returns `id: 0`, and `pong` carries no `id` at all. |
| 06 | major | API | `/candles?interval=1d` disagrees with dreamDEX's own `/volume` **and** the WS `ohlcv` snapshot on the oldest completed daily bar of **every** market — 7 of 7, both environments. The two other surfaces agree with each other. |
| 07 | normal | API, docs | `invalid_interval` is a documented error name that no endpoint ever returns. |
| 08 | normal | API, docs | `/candles` refuses to work without an `interval` parameter that no doc page names, and silently ignores `limit`/`from`/`since`/`until`/`max` with `200`. |

Totals: **4 major + 4 normal**.

## Reproducing

```
npm install
node src/index.js
```

Individual probes for each item are in `probes/` (`.mjs` scripts with their captured `.log` / `.json`
output alongside). Item 06 in particular is deterministic across repeated runs and reproducible from the
public REST and WebSocket endpoints without an account.

## Re-verification, 2026-11-11

Item 06 was swept again on 2026-11-11, three days after it was first measured
(`probes/probe-candle-all-markets-20261111-mainnet.log`, `...-shannon.log`,
`probes/probe-candle-scan-20261111.log`, `probes/ws-window-shape-20261111.log`,
`probes/auditor-run-20261111-mainnet.log`). Same seven markets, same `index 0`, byte-identical volumes and
opens, while every series grew at the tail (mainnet SOMI 94 → 98 daily bars, Shannon 19 → 23). The disputed
day does not scroll away.

## Environments checked

Mainnet (chain 5031) and the testnet environment named on the bounty page, both cross-checked.
