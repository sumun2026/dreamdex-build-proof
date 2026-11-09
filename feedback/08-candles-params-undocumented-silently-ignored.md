# `/candles` requires a parameter no page names, and silently ignores every attempt to widen or move its window

Severity: normal
Area: docs, API

## Summary

`GET /v0/markets/{symbol}/candles` is documented on the trading page by **endpoint line only**. Its
one required query parameter is called `interval` — that name appears **nowhere** in the HTTP API
documentation; the only place the string occurs at all is the error-name table's `invalid_interval`
row. The set of accepted values is published only on the *WebSocket* page, under a **different name**
(`timeframe`).

Separately, the endpoint takes no window or count parameters, and passing plausible ones is **not
rejected** — they are dropped and the caller silently gets the default tail:

```
?interval=1d&limit=200                            -> 200, 94 candles
?interval=1d&from=1785000000000                   -> 200, 94 candles
?interval=1d&since=1785000000000&until=1786000000000 -> 200, 94 candles
?interval=1d&max=200                              -> 200, 94 candles
```

All four return byte-identical windows. Meanwhile the vendor's **own WebSocket** serves **100** daily
bars for the same market and interval, reaching back to 2026-07-31 — six days REST will not give you,
with no error and no documented reason.

## Steps to reproduce

1. Read the trading page: https://app.dreamdex.io/docs/developers/http-api/trading
   It lists `GET /v0/markets/{symbol}/candles` among the data endpoints. Search the page for
   `interval`, `timeframe`, `limit`, `from`, `to` → the word **`interval` does not occur**.
2. Search the whole HTTP API doc set for `interval` → the only hit is the error table row
   `invalid_interval` ("Unsupported candle interval") on
   https://app.dreamdex.io/docs/developers/http-api/error-handling
3. Call the endpoint with no parameters and see the server name the parameter for you:

   ```sh
   curl -i "https://api.dreamdex.io/v0/markets/SOMI:USDso/candles"
   ```
   ```
   HTTP/2 400
   error-name: missing_field
   {"description":"Query argument interval is required, but not found","name":"missing_field","status":400}
   ```

   (So the parameter is `interval` — discovered from a 400, not from the docs.)
4. Guess a value set from the WS page and confirm the REST enum matches it under a different name:

   ```sh
   curl -s "https://api.dreamdex.io/v0/markets/SOMI:USDso/candles?timeframe=1m"   # 400 missing_field interval
   curl -s "https://api.dreamdex.io/v0/markets/SOMI:USDso/candles?interval=1m"    # 200
   ```
5. Try to widen or shift the window and observe the silent no-op:

   ```sh
   for q in "interval=1d" "interval=1d&limit=200" "interval=1d&from=1785000000000" \
            "interval=1d&since=1785000000000&until=1786000000000" "interval=1d&max=200"; do
     printf '%-52s ' "$q"
     curl -s "https://api.dreamdex.io/v0/markets/SOMI:USDso/candles?$q" \
       | python -c "import sys,json;c=json.load(sys.stdin)['candles'];print('n=',len(c),'oldest=',c[0]['timestamp'])"
   done
   ```
   Observed 2026-11-08: `n=94 oldest=1785974400000` on **every** line, including `limit=200`.
6. Compare with the WebSocket, same market and interval:

   ```js
   ws.send(JSON.stringify({ id: 1, operation: "subscribe", channel: "ohlcv",
     params: { symbol: "SOMI:USDso", timeframe: "1d" } }));
   // snapshot candles.length === 100, oldest 2026-07-31
   ```

## Expected

- The REST candles page to state its parameters: the required `interval`, its allowed values, the
  number of bars returned, and whether a larger/older window is requestable.
- Unknown parameters to be rejected (`invalid_param`) rather than dropped — the same behaviour the
  `symbols` issue asks for, and consistent with the doc's promise that the API surface is what the
  docs say it is.

## Actual

Parameter name and enum are undocumented on the REST side (and use a different key from the WS side),
count and range parameters are silently ignored, and the REST window is *smaller* than the data the
vendor serves over WS for the same request.

## Impact

A chart or backtest built on REST daily candles silently starts ~94 days ago and cannot be extended;
the developer assumes either that no older data exists or that their `limit=` was honoured. Nothing in
the response distinguishes "this is all there is" from "you asked wrong". Combined with finding 06
(the oldest of exactly those bars carries wrong volume and a wrong open/high), the *first* bar of every
REST candle series is both unremovable-by-pagination and known-bad.

## Evidence

- `probes/probe-volume-horizon.mjs` sections "does /candles have the same horizon?" and "are
  from/to/limit accepted at all?" (14 interval/param combinations).
- `probes/probe-ws-channels3.mjs` section 2 (per-interval WS↔REST bar counts, six intervals).
- Saved live pages: `probes/LIVE_http-api-trading.txt` (172 lines; `interval` absent), and a
  grep of the full doc set showing `interval` only inside `invalid_interval`.
- No public spec: `https://api.dreamdex.io/v0/openapi.json`, `/v0/swagger.json`, `/v0/docs/openapi.json`
  → 404 (`probes/probe-openapi.mjs`). `https://app.dreamdex.io/docs/openapi.json` returns HTTP **200**
  but with `content-type: text/html` and the same ~190 KB SPA shell the site serves for invented doc
  routes (`/docs/api-reference` → 200 shell, `/docs/developers/http-api/trading/candles` → 200 shell),
  so there is no machine-readable parameter list at any path we could find. If a spec does exist,
  please point us at it — several of these items would be closed by it.

## Environment

- mainnet `https://api.dreamdex.io/v0` (chain 5031) and the docs as published 2026-11-08.
- Read-only GETs; no keys, no signatures, no writes.
- Wallet address: none — this item is read-only and unauthenticated; nothing was signed.
- SDK: not used for this item (public REST, and the WebSocket feed where noted).
