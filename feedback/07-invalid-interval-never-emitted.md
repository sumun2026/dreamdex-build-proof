# `invalid_interval` is a documented error name that no endpoint ever returns

Severity: normal
Area: API, docs

## Summary

The error-handling page lists `invalid_interval` — "Unsupported candle interval" — in the Validation
(400) table, and states that `name` is "stable and intended for programmatic error handling".

An unsupported candle interval is reachable on both surfaces and on both environments, and none of them
ever emits that name:

- REST `GET /v0/markets/{symbol}/candles?interval=3m` → `invalid_param` (mainnet **and** `stg`)
- WS `subscribe` `channel:"ohlcv"` with `timeframe:"3m"` → `subscription_failed` (mainnet **and** `stg`)

The response even spells out what the allowed values are, so the server plainly knows this is an interval
problem and still reports it generically:

```json
{"description":"parameter \"interval\" in query has an error: value is not one of the allowed values [\"1m\",\"5m\",\"15m\",\"1h\",\"4h\",\"1d\"] …","name":"invalid_param","status":400}
```

So the documented branch is dead code for every client. A handler written against the published table
(`if (err.name === "invalid_interval") fallBackToDefaultInterval()`) never fires, and the names that
*are* returned — `invalid_param`, `subscription_failed` — are generic and shared with many other
causes, so the client cannot distinguish "bad interval" from "bad symbol" or "bad timeframe shape"
without string-matching the `description`, which the same page says may change between releases.

## Steps to reproduce

REST:

```sh
B=https://api.dreamdex.io/v0
for iv in 1m 5m 15m 1h 4h 1d 3m 1w 1s bogus 1M 60; do
  echo -n "$iv -> "
  curl -s -D - -o /tmp/b "$B/markets/SOMI:USDso/candles?interval=$iv" \
    | grep -i -e '^HTTP' -e '^error-name'
  cat /tmp/b; echo
done
```

Run the same loop against both bases — swap `B` for
`https://stg.api.dreamdex.io/v0` — or use `probes/probe-interval-both-bases.mjs`, which does REST and
WS on each and writes `probes/probe-interval-both-bases.log`.

Observed (2026-11-08, identical on mainnet and `stg`): `1m 5m 15m 1h 4h 1d` → `200`; `3m 1w 1s bogus
1M 60` →

```
HTTP/2 400
error-name: invalid_param
{"description":"parameter \"interval\" in query has an error: value is not one of the allowed values: ...","name":"invalid_param","status":400}
```

WebSocket, with the documented singular-`symbol` shape (`probes/probe-ws-channels3.mjs`, section 1):

```js
ws.send(JSON.stringify({
  id: 1, operation: "subscribe", channel: "ohlcv",
  params: { symbol: "SOMI:USDso", timeframe: "3m" },
}));
// << {"type":"error","errorName":"subscription_failed","message":"subscription failed to channel: ohlcv"}
```

Same for `timeframe:"1w"` and for omitting `timeframe` entirely, and the same on the `stg` feed. No
surface we reached, on either environment, emits `invalid_interval`.

## Expected

Either emit `invalid_interval` for an unsupported candle interval as the table promises, or remove the
row and let clients handle `invalid_param` / `subscription_failed` — and if the latter, say which
`description` substrings are stable enough to branch on.

## Actual

`invalid_interval` appears in the error-name table only. Every real "unsupported interval" response
carries a different, generic name.

## Note on the WS path

`subscription_failed` is at least *documented* as "channel is valid but params were rejected (missing
field, unknown symbol, bad timeframe…)", so the WS side is arguably behaving to spec — it just isn't
the spec named in the error table. The REST side is the clearer defect: the endpoint knows the exact
failure (its own `description` says "value is not one of the allowed values") and reports it as a
generic `invalid_param`, even though a purpose-built name exists in the table on the same page.

## Evidence

- `probes/probe-interval-both-bases.mjs` and its captured output
  `probes/probe-interval-both-bases.log` (2026-11-08): all 12 REST interval values plus the absent
  case, and three WS `timeframe` cases, on mainnet and `stg` in one run.
- `probes/probe-ws-channels2.mjs` section E (12 REST interval values, with `error-name` header) and
  `probes/probe-ws-channels3.mjs` section 1 (REST + WS error names for the same failure).
- Live error-handling page re-fetched 2026-11-08 (HTTP 200):
  https://app.dreamdex.io/docs/developers/http-api/error-handling
  — Validation (400) table, row `invalid_interval` = "Unsupported candle interval". The row is still
  published as of this test.
- Read-only, unauthenticated.

## Environment

- mainnet `https://api.dreamdex.io/v0` + `wss://api.dreamdex.io/v0/ws/public` (chain 5031) **and**
  testnet `https://stg.api.dreamdex.io/v0` + `wss://stg.api.dreamdex.io/v0/ws/public` (what the bounty
  page calls **Somnia Tokyo testnet**; the SDK names it somniaTestnet / Shannon 50312, and the HTTP docs
  print no chain id), both tested 2026-11-08. The interval enum and every error name are byte-identical
  across the two bases, so this is one shared validation layer, not a mainnet-only regression.
- Wallet address: none — this item is read-only and unauthenticated; nothing was signed.
- SDK: not used for this item (public REST, and the WebSocket feed where noted).
