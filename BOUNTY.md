# dreamDEX Perps Builder Bounty — submission notes

Repository submitted for the **Feedback track** of the
[dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty) on DoraHacks
(submission deadline `2026-11-15T14:30:00.000Z` — the page shows "Submission deadline extended").

`feedback/` holds one Markdown file per issue, as the track requires: `Severity`, `Area`, then
`## Steps to reproduce`, `## Expected`, `## Actual`, `## Evidence`, `## Environment`. `probes/` holds the
scripts and raw logs that reproduce them. `src/` is the three-way market-data cross-check (REST vs Markets
SDK vs WebSocket) that surfaced several of them.

Everything was found through **public, unauthenticated reads**. No private keys, no signatures, no orders,
no writes to any endpoint. Nothing here is a security vulnerability, so per the bounty rules it belongs in
this repository rather than in `security@dreamdex.io`.

## The nine items

| # | Severity | Area | Summary |
|---|---|---|---|
| 01 | major | docs | The docs' own `# Wrong` example promises `200` + `[]` for a bad `symbols` value; the API answers `400 invalid_param`. |
| 02 | major | API | `/volume`'s `since`/`until` unit is never documented; a caller passing seconds gets **HTTP 200 with volume 0**, not an error. |
| 03 | normal | API | "All error responses are JSON + `Error-Name`" does not hold for router-level 404s (`text/plain`, no header). |
| 04 | major | docs | Every CCXT example uses `SOMI/USDC`; no `USDC` currency exists on this venue — the quote is always `USDso`. |
| 05 | normal | API | The WebSocket `id` field is documented `Required: yes`; omitting it executes the operation and returns `id: 0`, and `pong` carries no `id` at all. |
| 06 | major | API | `/candles?interval=1d` disagrees with dreamDEX's own `/volume` **and** the WS `ohlcv` snapshot on the oldest completed daily bar of **every** market — 7 of 7, both environments, on three runs five days apart. The two other surfaces agree with each other. |
| 07 | normal | API | `invalid_interval` is a documented error name that no endpoint ever returns. |
| 08 | normal | API | `/candles` refuses to work without an `interval` parameter that no doc page names, and silently ignores `limit`/`from`/`since`/`until`/`max` with `200`. |
| 09 | major | API | The same fill gets a **different `id` format** per surface — REST `2102928824…:4334984857…`, WS `1794447058934-0`, 0/4 and 0/100 overlap — and the only shared field, `timestamp`, is not unique: one `txHash` fills twice in the same millisecond. |

Totals: **5 major + 4 normal**.

## Reproducing

```
npm install
node src/index.js
```

Individual probes for each item are in `probes/` (`.mjs` scripts with their captured `.log` / `.json`
output alongside). Item 06 in particular is deterministic across repeated runs and reproducible from the
public REST and WebSocket endpoints without an account.

## Re-verification

- **2026-11-11 — item 06.** Swept again three days after it was first measured
  (`probes/probe-candle-all-markets-20261111-mainnet.log`, `...-shannon.log`,
  `probes/probe-candle-scan-20261111.log`, `probes/ws-window-shape-20261111.log`,
  `probes/auditor-run-20261111-mainnet.log`). Same seven markets, same `index 0`, byte-identical volumes
  and opens, while every series grew at the tail (mainnet SOMI 94 → 98 daily bars, Shannon 19 → 23). The
  disputed day does not scroll away.
- **2026-11-12 — items 01, 02, 03.** Re-issued every request in those reports against both bases in one
  run: `probes/recheck-01-20261112.mjs` → `.log`, `probes/recheck-02-20261112.mjs` → `.log`,
  `probes/recheck-03-20261112.mjs` → `.log`, plus the doc-example sweep `probes/probe-verbatim-20261112.log`.
  Verdicts unchanged.
- **2026-11-12 — the quoted documentation itself.** Every doc sentence cited by these reports was
  re-fetched from the live pages and from their raw markdown mirror (`https://app.dreamdex.io/docs/<path>.md`)
  and grepped: `probes/fetch-doc-md-20261112.mjs` → `.log`, `probes/doc-quotes-20261112.mjs` → `.log`,
  with the fetched markdown saved as `probes/docmd-20261112-*.md`. Note that the docs live on
  **`app.dreamdex.io`** — the same path under `dreamdex.io` returns `404` (`probes/find-doc-url-20261112.log`).
- **2026-11-13 — all nine items, a third pass.** Every request in all nine reports was re-issued against both
  environments on 2026-11-13, five days after the first draft, and every verdict came back unchanged.
  The transcripts are in `probes/` under the `20261113` suffix: `recheck-01` … `recheck-05`,
  `probe-candle-all-markets-20261113-mainnet.log` / `-shannon.log`, `probe-candle-scan-20261113.log`,
  `ws-window-shape-20261113.log`, `probe-interval-both-bases-20261113.log`,
  `probe-volume-horizon-20261113.log`, `trade-id-cross-surface-20261113.log`, and the raw WebSocket frames in
  `probe-ws-20261113.json`. Three details moved with the data and are corrected in the reports rather than
  left to a reviewer to find:
  - **Item 06** — the WS `ohlcv` daily window is a rolling 100 days ending today, so it has slid forward two
    days since 11-11 and now starts on exactly the same day as REST's oldest mainnet bar. The disputed day is
    still `index 0` of `/candles` on all 7 markets, still byte-identical, still a **2.593×** gap. The rolling
    window also explains why the *still-open* UTC day appears as a second, excluded disagreement in the sweep.
  - **Item 09** — the `timestamp` collision is **data-dependent**, not present on every page. The 11-12 capture
    had one collision (one `txHash` filling twice in the same millisecond); the 11-13 page had none. The
    reports now say so explicitly, because a reader re-running it today would otherwise see a different count
    and assume the claim had gone stale.
  - **Items 04 and 05** — two evidence paths pointed at `src/LIVE_…`, where the captures do not live; they are
    in `probes/` and the paths now resolve.
- Every path cited by the nine reports was machine-checked against this repository after the 11-13 pass:
  63 distinct `probes/` and `src/` references, **0 dangling**.

## Environments checked

Mainnet (chain 5031) and the testnet environment named on the bounty page ("Somnia Tokyo", Shannon `50312`
in the Markets SDK), both cross-checked on every item.
