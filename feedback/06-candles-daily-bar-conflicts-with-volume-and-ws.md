# REST `/candles` mis-aggregates the oldest daily bar of **every** market, contradicting dreamDEX's own `/volume` and WebSocket feed

Severity: major
Area: API

## Summary

`GET /v0/markets/{symbol}/candles?interval=1d` disagrees with two other first-party surfaces about the
**first (oldest) completed daily bar** it returns — for **all 4 mainnet markets and all 3 Shannon testnet
markets**, i.e. 7 out of 7. In every one of the 7, `/candles` reports a lower volume and a different open
than both `/volume` (same UTC day, millisecond window) and the WS `ohlcv` snapshot — and those two agree
with each other **to the cent**.

The clearest case, mainnet `SOMI:USDso`, day **2026-08-06 (UTC)**, `timestamp 1785974400000`:

| field | REST `/candles?interval=1d` | REST `/volume` (same UTC day) | WS `ohlcv` snapshot |
|---|---|---|---|
| volume | `1,152,641.11` | **`2,988,352.82`** | **`2,988,352.82`** |
| open | `0.0894` | — | `0.0906` |
| high | `0.0916` | — | `0.0929` |
| low | `0.0883` | — | `0.0883` ✅ |
| close | `0.0887` | — | `0.0887` ✅ |

Volume is understated by **2.593×** and the open/high are wrong, on a bar that is **three months old and
cannot change any more**. Every other comparable day of every market agrees exactly, so this is not a
rounding, timezone, or aggregation-window convention difference — it is one specific, systematic,
reproducible bar.

## Steps to reproduce

Against mainnet, no authentication, no keys:

```sh
B=https://api.dreamdex.io/v0
S=SOMI:USDso

# the bar as candles reports it
curl -s "$B/markets/$S/candles?interval=1d" | python -c "
import sys,json
for c in json.load(sys.stdin)['candles']:
    if c['timestamp']==1785974400000: print('candles:',c)"

# the same UTC day, summed by the vendor's own volume endpoint
curl -s "$B/markets/$S/volume?since=1785974400000&until=1786060800000"
```

Observed (2026-11-08, byte-identical across five separate runs):

```
candles: {'timestamp': 1785974400000, 'open': '0.0894', 'high': '0.0916', 'low': '0.0883', 'close': '0.0887', 'volume': '1152641.11'}
volume : {"baseVolume":"2988352.82","since":1785974400000,"until":1786060800000,"symbol":"SOMI:USDso"}
```

Then the WebSocket, using the documented singular-`symbol` shape:

```js
const ws = new WebSocket("wss://api.dreamdex.io/v0/ws/public");
ws.onopen = () => ws.send(JSON.stringify({
  id: 1, operation: "subscribe", channel: "ohlcv", params: { symbol: "SOMI:USDso", timeframe: "1d" } }));
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.channel === "ohlcv" && m.type === "snapshot")
    console.log("ws:", m.candles.find((c) => c.timestamp === 1785974400000));
};
```

```
ws: { timestamp: 1785974400000, open: '0.0906', high: '0.0929', low: '0.0883', close: '0.0887', volume: '2988352.82' }
```

## It is every market, on both environments

`probes/probe-candle-all-markets.mjs` takes each market from `/markets`, diffs **every** daily bar of
`/candles` against the WS `ohlcv` snapshot by timestamp, and calls `/volume` for each mismatching day.
Run 2026-11-08:

```
mainnet — 4 REST markets, interval=1d
SOMI:USDso     rest=94 ws=100 oldest=2026-08-06 | disagreeing bars=1
   index 0 of 94  2026-08-06  /candles vol=1152641.11  open=0.0894   | ws vol=2988352.82  open=0.0906   | /volume 2988352.82
USDC.e:USDso   rest=93 ws=100 oldest=2026-08-06 | disagreeing bars=1
   index 0 of 93  2026-08-06  /candles vol=1486.63     open=1.0002   | ws vol=4625.52     open=1.0002   | /volume 4625.52
WBTC:USDso     rest=94 ws=100 oldest=2026-08-06 | disagreeing bars=1
   index 0 of 94  2026-08-06  /candles vol=8.37105     open=64602.2  | ws vol=17.22636    open=64631    | /volume 17.22636
WETH:USDso     rest=94 ws=100 oldest=2026-08-06 | disagreeing bars=1
   index 0 of 94  2026-08-06  /candles vol=31.8        open=1906.53  | ws vol=58.1861     open=1906.16  | /volume 58.1861

shannon — 3 REST markets
WETH:USDso     rest=19 ws=85  oldest=2026-10-20 | disagreeing bars=1
   index 0 of 19  2026-10-20  /candles vol=8.4592      open=2390.19  | ws vol=11.197      open=2405.47  | /volume 11.197
SOMI:USDso     rest=19 ws=100 oldest=2026-10-20 | disagreeing bars=2
   index 0 of 19  2026-10-20  /candles vol=161000      open=0.1852   | ws vol=214600      open=0.1877   | /volume 214600
   index 18 of 19 2026-11-07  <- the still-open UTC day, EXCLUDED from the claim (see below)
WBTC:USDso     rest=19 ws=100 oldest=2026-10-20 | disagreeing bars=2
   index 0 of 19  2026-10-20  /candles vol=0.93554     open=81535.3  | ws vol=1.24767     open=81862    | /volume 1.24767
   index 18 of 19 2026-11-07  <- the still-open UTC day, EXCLUDED from the claim (see below)
```

**7 of 7 markets. In 7 of 7 the bad bar is `index 0`, the oldest bar REST serves. In 7 of 7, `/volume` and
the WS feed agree with each other and `/candles` is the outlier.**

Deliberately excluded: the newest bar of the Shannon `SOMI`/`WBTC` rows is the **still-open UTC day** —
`/volume` refuses it (`400 "until must be at least 30 minutes in the past"`, their documented rule) and a
live WS bar legitimately moves while REST lags. It is listed so you can see it was measured, not quietly
dropped; the finding does not rest on it.

## It is not a sampling artifact either

`probes/probe-candle-scan.mjs` walks **every** daily bar REST returns for mainnet `SOMI` and compares
`/candles.volume` against `/volume.baseVolume` for that exact UTC day:

```
bars compared: 93 | volume mismatches: 1 | not comparable: 1     (the in-progress day is rejected by
                                                                  the documented 30-min rule)
  2026-08-06 /candles=1152641.11   /volume=2988352.82   <- mismatch
  2026-08-07 /candles=1612914.18   /volume=1612914.18   <- adjacent day, exact match
```

Re-run five times over ~3 hours, including once at the end of this session
(`probes/recheck-06.mjs`): same single day, same numbers, byte-for-byte.

## Where the bad bar sits

```
mainnet  REST day 0 = 2026-08-06 | WS window 2026-07-30/31 → 2026-11-07 | /volume covers it
shannon  REST day 0 = 2026-10-20 | WS window 2026-07-31 → 2026-11-07 | /volume covers it
```

Two measured facts about that position (`probes/ws-window-shape.mjs`, run 2026-11-08):

1. **The WS `ohlcv` snapshot is a fixed 100-bar window ending the current UTC day, not a deeper history**
   — mainnet oldest 2026-07-30 (USDC.e) / 2026-07-31 (SOMI), Shannon oldest 2026-07-31; Shannon WETH
   returns fewer bars (85) because that market's data starts later. So the WS comparison is not an
   artifact of the two surfaces covering different ranges: **the WS feed contains REST's day 0 as a normal
   interior bar**, 50 days inside its window on Shannon and 28 inside on mainnet. Same for `/volume`,
   which takes an arbitrary ms window and needs no retention at all.
2. **The bad bar is always exactly `index 0` of what `/candles` chooses to return**, wherever that lands —
   2026-08-06 on mainnet, 2026-10-20 on Shannon, never any other index, in all 7 markets.

That is the observation; the cause is theirs. The shape is consistent with the first bar of the REST series
being aggregated from a mid-day start (the market's own listing/retention instant) and then published as a
full daily candle without being labelled partial — but we cannot see inside the aggregation, and nothing in
this report depends on that being the right explanation. The finding is the measurement: **for one
historical, immutable day per market, the vendor's own three endpoints give two different answers, and
`/candles` is the minority of one.**

## Why this matters

- `/candles` is the endpoint charts and indicators are built from. A daily bar with 39% of true volume
  skews volume-profile, OBV, VWAP-over-history, and any "average daily volume" filter, and draws a
  high/volume anomaly that never happened. On `USDC.e` the same bar reads 1,486 against a true 4,625 — a
  3.1× gap on a stablecoin pair.
- It is **every listed market on both environments**, so any builder who charts the full available history
  charts the defect; nobody can avoid it by picking a different pair.
- The affected bar is in the immutable past, so a client cannot self-heal by re-polling, and caching
  makes it permanent.
- The two answers come from one backend, so a builder has no documented way to know which to trust, and
  the REST series does not label its own first bar as partial.

## Expected

`/candles` volume for a completed UTC day equals `/volume.baseVolume` for the same day (and the same OHLC
as the `ohlcv` channel), or the truncated bar is excluded / flagged, or the retention boundary is
documented so clients can drop the first bar themselves.

## Actual

The oldest completed daily bar of every market disagrees between surfaces, silently, on both environments.

## Evidence

- `probes/probe-candle-all-markets.mjs` + `.log` — all 7 markets, both bases, bar-by-bar; the table above.
- `probes/probe-candle-scan.mjs` + `probes/probe-candle-scan.log` (93-bar sweep, 1 mismatch, index 0).
- `probes/probe-candle-conflict.mjs` + `.log` (field-by-field diff, 3 determinism passes, `/volume` control).
- `probes/probe-candle-diff.mjs` + `.log` (per-interval WS↔REST comparison; 1m/15m/1h/4h bars match exactly —
  only daily diverges).
- `probes/recheck-06.mjs` + `.log` (three surfaces, one day, same-turn re-verification).
- `probes/ws-window-shape.mjs` (2026-11-08, this turn) — bar count, oldest and newest timestamps of the WS
  daily window on both bases vs REST's, which is what pins the WS coverage of the disputed day.
- Check 6 of **https://github.com/sumun2026/dreamdex-build-proof** prints this comparison end-to-end
  (`node src/index.js --env both`), so you can reproduce it from the public repo without our scripts.

## What is *not* claimed

- No claim that the WS or `/volume` figure is the correct one — we only show the three disagree and
  that two of them agree with each other. Which aggregation is authoritative is yours to say.
- No claim about *why* (the retention-boundary story above is a hypothesis we cannot see inside).
- No claim involving the currently-open daily bar.
- Sub-hourly intervals were compared on mainnet `SOMI:USDso` only; the 7-market sweep is daily.

## Environment

- mainnet `https://api.dreamdex.io/v0` + `wss://api.dreamdex.io/v0/ws/public` (chain 5031)
- testnet `https://stg.api.dreamdex.io/v0` + `wss://stg.api.dreamdex.io/v0/ws/public` (Somnia Shannon)
- `@somnia-chain/markets-sdk` not involved in this item.
- Node 21+ global `fetch`/`WebSocket`; unauthenticated GETs and public `subscribe` only — no keys, no
  signature, no writes.
- Wallet address: none — this item is read-only and unauthenticated; nothing was signed.
