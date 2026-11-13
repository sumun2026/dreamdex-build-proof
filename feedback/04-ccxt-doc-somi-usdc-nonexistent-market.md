# Every code example on the CCXT library page uses `SOMI/USDC`, a market that does not exist on dreamDEX

Severity: major
Area: docs

## Summary

The CCXT library page drives every one of its examples with the unified symbol `'SOMI/USDC'`.
dreamDEX has no `USDC` currency and no `SOMI/USDC` market on either environment — the quote is
always `USDso`, and the only USD-like currencies are `USDso` and `USDC.e`. A builder who copies the
page verbatim gets a failed call on every single example: `loadMarkets` succeeds, then
`fetchTicker` / `fetchOrderBook` / `fetchTrades` / `fetchOHLCV` / `createOrder` / `watchOrderBook` /
`vaultApprove` all reject the symbol.

The correct symbol is `SOMI/USDso` (unified) / `SOMI:USDso` (market id).

## Steps to reproduce

1. Open the page: https://app.dreamdex.io/docs/developers/libraries/ccxt
2. Note the symbol used in the examples, e.g.

   ```js
   await exchange.fetchTicker('SOMI/USDC');
   await exchange.fetchOrderBook('SOMI/USDC');
   await exchange.fetchTrades('SOMI/USDC');
   await exchange.fetchOHLCV('SOMI/USDC', '1h');
   await exchange.createOrder('SOMI/USDC', 'limit', ...);
   await exchange.watchOrderBook('SOMI/USDC');
   await exchange.vaultApprove('SOMI/USDC', 'SOMI', 100);
   ```

3. Ask the API what the market and currency universe actually is (these are the very lists the
   adapter's `parseMarket()` maps to unified symbols):

   ```sh
   curl -s https://api.dreamdex.io/v0/currencies | python -c "import sys,json;print([c['code'] for c in json.load(sys.stdin)['currencies']])"
   curl -s https://api.dreamdex.io/v0/markets     | python -c "import sys,json;print([m['symbol'] for m in json.load(sys.stdin)['markets']])"
   curl -s https://stg.api.dreamdex.io/v0/markets | python -c "import sys,json;print([m['symbol'] for m in json.load(sys.stdin)['markets']])"
   ```

   Result on 2026-11-08:

   ```
   mainnet currencies : USDC.e, WBTC, WETH, SOMI, USDso        <-- no plain "USDC"
   mainnet markets    : SOMI:USDso, USDC.e:USDso, WBTC:USDso, WETH:USDso
   testnet  markets   : WBTC:USDso, WETH:USDso, SOMI:USDso
   ```

4. Cross-check with the project's own market-data page
   (https://app.dreamdex.io/docs/developers/http-api/market-data), which states the pair format and
   universe outright:

   > "Endpoints that take a `{symbol}` path parameter expect a `BASE:QUOTE` pair using the exact
   > currency codes below. **The quote is always `USDso`.**"

5. Confirm the API rejects the doc's symbol:

   ```sh
   curl -i "https://api.dreamdex.io/v0/markets/SOMI:USDC/tickers"
   ```

   → `404 {"description":"market not found: SOMI:USDC","name":"market_not_found","status":404}`

## Expected

The examples on the library page use a market that exists on dreamDEX — `SOMI/USDso` — so a
copy-pasted snippet runs.

## Actual

Every example uses `SOMI/USDC`. `USDC` is not a dreamDEX currency code (only `USDC.e`, which is a
different token: the bridged USDC, quoted *against* `USDso` as `USDC.e:USDso`), and the page's own
market universe contains no `USDC` quote at all.

The likely origin is a template copied from another Somnia Markets venue that *does* quote against
`USDC`. Note the SDK package docs repeat the same string (`docs/EXCHANGE.md`, `docs/SPOT.md`,
`README.md` in `@somnia-chain/markets-sdk` all use `SOMI/USDC`) — worth checking whether those are
in scope for the same fix.

## Evidence

- Live page fetch: `https://app.dreamdex.io/docs/developers/libraries/ccxt` → HTTP 200, 278,668 bytes
  (saved as `probes/LIVE_developers_libraries_ccxt.txt`; symbol used at extracted lines 132, 140, 148,
  156, 167, 221, 252-254).
- Live `/v0/currencies` and `/v0/markets` on both environments, 2026-11-08.
- `ccxt_dreamdex.ts` `parseMarket()` — the adapter builds `symbol` as `base + '/' + quote` from the
  `BASE:QUOTE` market id returned by `/v0/markets`, so the unified symbol space is exactly the four
  `*:USDso` markets above; `SOMI/USDC` can never be produced.
- Reproduction script: `probes/probe-ccxt-symbol.mjs` (prints `has 'USDC' : false` and
  `'SOMI/USDC' valid? false` for both environments).
- Re-run 2026-11-13, five days after the first draft: `probes/probe-ccxt-symbol.mjs` → `probes/recheck-04-20261113.log`. Mainnet `/currencies` still `SOMI, USDso, USDC.e, WBTC, WETH` — **`USDC` still absent**, `USDC.e` present — and the unified symbol space still `SOMI/USDso, USDC.e/USDso, WBTC/USDso, WETH/USDso`, so `'SOMI/USDC' valid? false`. On `stg` `/currencies` is `USDso, WBTC, WETH, SOMI` (no `USDC` there either) and the same `false`. Unchanged.

## What is *not* claimed

No claim about the adapter's code being wrong — `parseMarket` behaves correctly and maps the real
markets fine. The defect is confined to the example symbols in the documentation.

## Environment

- Docs as published 2026-11-08.
- mainnet `https://api.dreamdex.io/v0` (chain 5031) and testnet `https://stg.api.dreamdex.io/v0`
  (Shannon, 50312) — affected on both.
- Read-only `GET` requests; no keys, no signatures, no writes.
- Wallet address: none — this item is read-only and unauthenticated; nothing was signed.
- SDK: `@somnia-chain/markets-sdk` 0.32.1 — `loadMarkets()` output is part of the evidence here.
