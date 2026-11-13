# `/v0/markets/{symbol}/volume` never states that `since`/`until` are milliseconds, and a caller who sends Unix seconds gets HTTP 200 with all-zero volume

Severity: major
Area: API

## Summary

`/volume`'s `since`/`until` are Unix **milliseconds**, but the unit appears nowhere on the page or in the parameter table. A caller who passes the near-universal Unix-seconds value gets HTTP `200` and `baseVolume: "0"` — a silently wrong answer, not an error. Both documented guards are structurally unable to catch it: a seconds pair is 1000× too narrow to trip the 40-day cap, and its `until` lands in 1970, so it is trivially "older than 30 minutes".

## Steps to reproduce

The market-data doc describes the endpoint as an aggregate over `[since, until)` with defaults and bounds — "the range must not exceed 40 days, and an `until` newer than 30 minutes ago is rejected" — but **never gives the unit** of `since`/`until` anywhere on the page. The only unit statement in the whole HTTP API doc set is for the auth field `expiresAt` ("Unix milliseconds").

Pick the last 24 hours of a market, once written in seconds and once in milliseconds, and read `/tickers` at the same instant as a control that the market genuinely traded:

```sh
B=https://api.dreamdex.io/v0
NOW=$(date +%s)                                   # seconds

# (A) the natural reading of "Unix timestamp" — seconds
curl "$B/markets/SOMI:USDso/volume?since=$((NOW-86400))&until=$((NOW-1800))"

# (B) the same window in milliseconds
curl "$B/markets/SOMI:USDso/volume?since=$(( (NOW-86400)*1000 ))&until=$(( (NOW-1800)*1000 ))"

# (C) control: the same market's own 24h ticker
curl "$B/tickers?symbols=SOMI:USDso"

# (D) a range in January 1970 is accepted too
curl "$B/markets/SOMI:USDso/volume?since=0&until=86400"
```

## Expected

Either (a) the docs state the unit, or (b) a range that is obviously not a plausible recent window is rejected, so a unit mistake cannot pass as a successful answer.

## Actual

(A) returns **`200` with `baseVolume: "0"`**. (B) returns the same query with real numbers. (D) is accepted. Reproduced for `SOMI:USDso` and `WETH:USDso` on both bases.

```
A seconds 1d   -> 200 {"baseVolume":"0","quoteVolume":"0","since":1793990329,"until":1794074929}
B millis  1d   -> 200 {"baseVolume":"576276.27","quoteVolume":"97035.922406",...}
C control      -> 200 {"symbol":"SOMI:USDso","volume":"587476.75","lastTradeAt":1794076469005,...}
D since=0      -> 200 {"baseVolume":"0","since":0,"until":86400}
```

The `since`/`until` echo in (A) is the proof: the server accepts the numbers, treats them as milliseconds, and lands on 1970-01-21 — a 21-day window before the exchange existed.

## Why the documented bounds do not save the caller

Both guards operate on the raw numbers, so a seconds input makes them structurally unable to fire:

- *40-day cap* — a seconds pair is 1000× closer together than the same pair in ms, so a "1 day" query looks like 86 seconds. The cap cannot reject it.
- *"`until` newer than 30 minutes ago is rejected"* — `until=1794074929` read as ms is 1970, i.e. ~56 years in the past, so it is trivially older than 30 minutes. The check passes.

Measured confirmation that the checks themselves are correct and are simply being fed the wrong scale (`probes/probe-cap.mjs`, span = `until − since` in ms, both bases):

```
span=40.00000000d -> 200
span=40.00001157d -> 400 "time range must not exceed 40 days"
until=now-29m     -> 400 "until must be at least 30 minutes in the past"
until=now-31m     -> 200
```

So this is not a broken validator — it is a **silent wrong answer** on the most likely caller mistake, on a mainnet endpoint whose whole purpose is feeding volume aggregators. An aggregator polling this endpoint in seconds records `0` volume forever, with a 200 status and no field in the response that says anything went wrong.

## Suggested fix (not part of the finding)

State the unit in the parameter table, and reject a window that cannot be real — e.g. `until` before the exchange's first market, or a `since`/`until` whose digit count is inconsistent with the documented default echo the endpoint already returns.

## Evidence

- Captured 2026-11-07, re-run the same day before filing: `probes/probe-units.mjs` → `probes/probe-units.json`, `probes/probe-confirm.mjs` → `probes/probe-confirm.json`
- Re-verified 2026-11-12, both bases: `probes/recheck-02-20261112.mjs` → `probes/recheck-02-20261112.log`. Case A `200` `baseVolume:"0"` with the server echoing `since:1794361474 until:1794446074` (a 85-second span), case B the same window in ms returning real volume, case D accepted, on both bases in the same run.
- Re-verified again 2026-11-13, both bases: `probes/recheck-02-20261113.mjs` → `probes/recheck-02-20261113.log`. Case A again `200` with `baseVolume:"0"` and the server again echoing the seconds pair as a ~85-second span (mainnet `since:1794474008 until:1794558608`, `stg` the same), case B again the same window in ms returning a real volume (mainnet `880378.23`; the figure moves because volume moves — the shape does not), case C `/tickers` again `200`, case D `since=0&until=86400` again accepted with `baseVolume:"0"`. The absolute numbers in the transcript differ from the 11-07 capture for that reason; the *behaviour* is identical on both bases.
- 10 cases incl. seconds/ms/mixed and both symbols; every case carries the server's own `since`/`until` echo

## Environment

- `https://api.dreamdex.io/v0` (mainnet, Somnia 5031) and `https://stg.api.dreamdex.io/v0` (testnet — the bounty page's "Somnia Tokyo", Shannon `50312` per the SDK)
- No auth, no wallet, read-only GET
- Wallet address: none — this item is read-only and unauthenticated; nothing was signed.
- Docs as published 2026-11-07; the market-data page re-read 2026-11-12 still has no unit statement for `since`/`until` (see `probes/docmd-20261112-developers_http-api_market-data.md`)
- Reference: `GET /v0/tickers` returns `lastTradeAt` / `timestamp` as 13-digit ms, so the API is internally consistent about ms — the gap is documentation only

## What is *not* claimed

- Not claimed that ms is the "wrong" choice — every other timestamp in this API is ms. The finding is the missing unit statement plus the 200-with-zeros failure mode.
- Not verified: whether a first-party SDK or the `dreamBot` surface already converts to ms before calling, i.e. how much real traffic hits this.
