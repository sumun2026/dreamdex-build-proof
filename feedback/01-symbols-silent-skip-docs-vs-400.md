# Docs state that unknown or mis-serialized `symbols` are silently skipped, but the API returns HTTP 400

Severity: major
Area: docs

## Steps to reproduce

Read https://dreamdex.io/docs/developers/http-api/market-data (Market Data → Order book depth). It states, in a commented curl example and again in prose:

```
# Wrong — parsed as one literal symbol "SOMI:USDso,WETH:USDso", which matches
# no market and is silently skipped, so the response is []
curl "$BASE_URL/orderbooks?symbols=SOMI:USDso,WETH:USDso"
```

> "Unknown or malformed symbols are silently skipped rather than erroring, so a
> serialization mismatch shows up as an empty `[]` rather than a 4xx."

> "The same repeated-key serialization applies to every array-valued `symbols`
> parameter in this API (`/v0/tickers`, `/v0/orderbooks`)."

and, for tickers:

> "omit `symbols` to cover every available market; unknown symbols are silently skipped."

Run the documented "Wrong" example verbatim against both bases, plus the equivalent cases on `/v0/tickers`:

```sh
B=https://api.dreamdex.io/v0     # also test https://stg.api.dreamdex.io/v0
curl -i "$B/orderbooks?symbols=SOMI:USDso,WETH:USDso"
curl -i "$B/orderbooks?symbols=SOMI:USDso,FAKE:USDso"
curl -i "$B/orderbooks?symbols=FAKE:USDso"
curl -i "$B/orderbooks?symbols=SOMI"
curl -i "$B/tickers?symbols=SOMI:USDso,FAKE:USDso"
```

## Expected

Per the docs: `200` with `[]` (or, for a mixed list, the valid entries with the unknown one skipped).

## Actual

`400 Bad Request`, `invalid_param`, for every case — and a mixed list fails as a whole, so a valid symbol never gets through:

```json
{"context":{"invalid_symbols":["SOMI:USDso,FAKE:USDso"]},
 "description":"unknown market symbols: SOMI:USDso,FAKE:USDso",
 "name":"invalid_param","status":400}
```

Identical on `stg.api.dreamdex.io` and `api.dreamdex.io`. The correct repeated-key form does return `200` with both books, so the serialization advice itself is right — only the promised failure mode is wrong.

## Evidence

Captured 2026-11-07, both bases:

| request | docs predict | observed |
|---|---|---|
| `/orderbooks?symbols=SOMI:USDso&symbols=WETH:USDso` | 200, 2 books | 200, 2 books ✅ |
| `/orderbooks?symbols=SOMI:USDso,WETH:USDso` (the doc's own example) | 200 `[]` | **400 `invalid_param`** |
| `/orderbooks?symbols=SOMI:USDso,FAKE:USDso` | 200, SOMI returned | **400**, nothing returned |
| `/orderbooks?symbols=FAKE:USDso` | 200 `[]` | **400 `invalid_param`** |
| `/orderbooks?symbols=SOMI` | 200 `[]` | **400 `invalid_param`** |
| `/tickers?symbols=SOMI:USDso,FAKE:USDso` | 200 | **400 `invalid_param`** |

## Why this matters for an integrator

The doc sentence exists to tell a caller how to *handle* the error: it explicitly reassures you that a serialization mismatch degrades to `[]` "rather than a 4xx". A client written to that sentence has no 400 branch for `/orderbooks`, so the first time a caller passes the comma form — which is exactly what most HTTP clients do with `params={"symbols": ["A","B"]}`, per the same paragraph — the request throws instead of returning an empty list.

## Environment

- Network: mainnet (Somnia 5031) via `https://api.dreamdex.io/v0`, and testnet via `https://stg.api.dreamdex.io/v0` (what the bounty page calls **Somnia Tokyo testnet**; the SDK names it `somniaTestnet` / Shannon `50312`, and the HTTP docs print no chain id)
- No SDK, no authentication, no wallet — plain `curl` / `fetch` GET requests
- Doc page as published on 2026-11-07

## What is *not* claimed

- Not claimed that the API behaviour is wrong — returning 400 with `invalid_symbols` is arguably the better design. The finding is that the published docs promise the opposite, including in a worked example.
- Not verified: the WebSocket surface, and whether any first-party SDK wraps `/orderbooks` and swallows the 400.
