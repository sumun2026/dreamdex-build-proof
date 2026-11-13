# Docs state that unknown or mis-serialized `symbols` are silently skipped, but the API returns HTTP 400

Severity: major
Area: docs

## Summary

The market-data page documents a failure mode that the API does not have. It says an unknown or comma-joined `symbols` value is "silently skipped" and answers `200` with `[]`; every such request actually returns `400 invalid_param`, and a mixed list fails as a whole so the valid symbol never comes back. The page's own `# Wrong` example is one of the tested requests. A client written to that sentence has no 400 branch for `/orderbooks`.

## Steps to reproduce

Read https://app.dreamdex.io/docs/developers/http-api/market-data (Market Data → Order book depth; raw markdown at the same path with `.md` appended). It states, in a commented curl example and again in prose:

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

- `probes/probe-verbatim.mjs` — sends the doc's `# Wrong` example and the correct repeated-key form verbatim against both bases. Outputs: `probes/probe-verbatim.json` (2026-11-07) and `probes/probe-verbatim-20261112.json` / `.log` (2026-11-12 re-run).
- `probes/recheck-01-20261112.mjs` → `probes/recheck-01-20261112.log` — every row of the table below re-issued on both bases on 2026-11-12: the same five `400 invalid_param` answers and the same `200` with two books for the control.
- Third run, 2026-11-13, six days after the first draft: `probes/recheck-01-20261113.mjs` → `probes/recheck-01-20261113.log`. Same five `400 invalid_param` answers with the same `invalid_symbols` context on **both** bases, and the same `200` with two books for the repeated-key control. No verdict changed.
- `probes/probe-confirm.mjs` / `.json` — the wider case sweep captured at filing.
- The quoted doc sentences re-fetched 2026-11-12 from the page's raw markdown mirror (`https://app.dreamdex.io/docs/developers/http-api/market-data.md`), saved as `probes/docmd-20261112-developers_http-api_market-data.md` — the `# Wrong` example and the "silently skipped … rather than a 4xx" sentence are both still published.

Captured 2026-11-07, both bases, and re-verified 2026-11-12 (both bases, identical verdicts):

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
- Wallet address: none — this item is read-only and unauthenticated; nothing was signed.
- Doc page as published on 2026-11-07 and re-read 2026-11-12: the `# Wrong` example and the "silently skipped … rather than a 4xx" sentence are still live.

## What is *not* claimed

- Not claimed that the API behaviour is wrong — returning 400 with `invalid_symbols` is arguably the better design. The finding is that the published docs promise the opposite, including in a worked example.
- Not verified: the WebSocket surface, and whether any first-party SDK wraps `/orderbooks` and swallows the 400.
