# Route-not-found responses are plain text with no `Error-Name` header, contradicting "All error responses use a consistent JSON format"

Severity: normal
Area: API

## Summary

The error-handling page promises that **all** error responses are JSON with a stable `name` plus an `Error-Name` header. That holds for errors raised inside a handler, but not for the router's own `404`: those come back `text/plain` — `404 page not found` — with no `Error-Name` header at all. Two of the paths that hit this are routes the market-data page itself tells callers about.

## Steps to reproduce

The error-handling doc (https://app.dreamdex.io/docs/developers/http-api/error-handling) states two contracts:

> "All error responses use a consistent JSON format" — `{status, name, description}`

> "The Error-Name response header also contains the error name for quick inspection without parsing the body."

The market-data doc then directs callers to two paths it says return 404 (`.../market-data`, markdown mirror `.../market-data.md`):

> "Order book depth is served **only** by the query-parameter form `GET /v0/orderbooks?symbols=<symbol>`. There is no per-market path - `GET /v0/markets/{symbol}/orderbook` and `GET /v0/orderbooks/{symbol}` both **404**."

Request one of those, and an arbitrary unknown route, and look at the headers:

```sh
B=https://api.dreamdex.io/v0
curl -i "$B/markets/SOMI:USDso/orderbook"
curl -i "$B/orderbooks/SOMI:USDso"
curl -i "$B/nonexistent-route"

# for contrast, an error the API does generate from inside a handler:
curl -i "$B/orderbooks"
```

## Expected

`application/json` with `{"status":404,"name":"...","description":"..."}` and an `Error-Name` header, per the "all error responses" sentence.

## Actual

```
HTTP/1.1 404 Not Found
content-type: text/plain; charset=utf-8
(no Error-Name header)

404 page not found
```

The in-handler error next to it behaves exactly as documented, which isolates the gap to the router's own 404 (and 405, presumably):

```
HTTP/1.1 400 Bad Request
content-type: application/json
error-name: missing_field

{"description":"Query argument symbols is required, but not found","name":"missing_field","status":400}
```

Identical on `api.dreamdex.io` and `stg.api.dreamdex.io`.

## Why it matters

An integrator who follows the doc and writes one error path — parse JSON, switch on the stable `name` — gets a plain-text body with no `name` at the moment it matters most: a typo'd route or a path-style `/orderbooks/{symbol}` call, which is the natural thing to try given how most EVM APIs are shaped, and which the market-data doc explicitly tells the caller about without saying the body will be unstructured. `res.json()` throws on those responses.

## Evidence

- Captured 2026-11-07, re-run before filing: `probes/probe-errname.mjs` → `probes/probe-errname.json` (8 cases × both bases, each recording status, `Error-Name` header and body)
- Header dumps for the three 404 routes above
- Re-verified 2026-11-12 on both bases with the exact commands in this report: `probes/recheck-03-20261112.mjs` → `probes/recheck-03-20261112.log` — all three router 404s still `text/plain; charset=utf-8` with `(absent)` `Error-Name`, and the in-handler 400 control still JSON with `error-name: missing_field`, in the same run.
- Re-verified 2026-11-13 on both bases: `probes/recheck-03-20261113.mjs` → `probes/recheck-03-20261113.log` — all three router 404s still `404` / `text/plain; charset=utf-8` / `(absent) Error-Name` with the body `404 page not found`, and the in-handler 400 control in the same run still JSON with `error-name: missing_field`. Unchanged.
- The two quoted doc sentences re-fetched 2026-11-12 from the `.md` mirror: `probes/docmd-20261112-developers_http-api_error-handling.md`, `probes/docmd-20261112-developers_http-api_market-data.md`

## Environment

- `https://api.dreamdex.io/v0` (mainnet 5031) and `https://stg.api.dreamdex.io/v0` (testnet — "Somnia Tokyo" on the bounty page, Shannon `50312` per the SDK)
- No auth, read-only GET
- Wallet address: none — this item is read-only and unauthenticated; nothing was signed.
- Docs as published 2026-11-07 and re-read 2026-11-12 (both sentences still live)

## What is *not* claimed

- Not claimed that `market_not_found` is missing — it works: `/markets/FAKE:USDso/volume` correctly returns `404` JSON with `name: market_not_found` and the `Error-Name` header. The gap is only for routes the router itself does not match.
- Not verified: 405 Method Not Allowed, 500-level responses, or the rate-limit (429) body shape — none were triggered, deliberately, since a 429 hunt means hammering a mainnet endpoint.
