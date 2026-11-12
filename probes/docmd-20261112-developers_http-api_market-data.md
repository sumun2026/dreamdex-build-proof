# Market Data

These public endpoints return information about available trading pairs, supported currencies, and current order book depth. No [authentication](authentication.md) is required.

## Markets and currency codes

Endpoints that take a `{symbol}` path parameter expect a `BASE:QUOTE` pair using the exact currency codes below. The quote is always `USDso`. Note the casing and that the native Somnia token is `SOMI` (not `SOM`) - copy-pasting a placeholder such as `SOM:USD` returns [`market_not_found`](error-handling.md).

| Environment              | Symbols                                          | Currency codes                       |
| ------------------------ | ------------------------------------------------ | ------------------------------------ |
| Mainnet (`5031`)         | `SOMI:USDso`, `USDC.e:USDso`, `WBTC:USDso`, `WETH:USDso` | `SOMI`, `USDso`, `USDC.e`, `WBTC`, `WETH` |
| Testnet (Shannon, `50312`) | `SOMI:USDso`, `WBTC:USDso`, `WETH:USDso`        | `SOMI`, `USDso`, `WBTC`, `WETH`      |

`GET /v0/markets` (below) and `GET /v0/currencies` are the canonical, always-current source of truth - query them at runtime rather than hard-coding this list. See also [Live Markets](../contracts/contract-specifications.md#live-markets) for the corresponding contract addresses.

#### `GET /v0/markets`

#### `GET /v0/currencies`

### Order book depth

Order book depth is served **only** by the query-parameter form `GET /v0/orderbooks?symbols=<symbol>`. There is no per-market path - `GET /v0/markets/{symbol}/orderbook` and `GET /v0/orderbooks/{symbol}` both **404**.

```sh
# One market
curl "$BASE_URL/orderbooks?symbols=SOMI:USDso"
```

> [!WARNING]
> **Pass multiple symbols as repeated keys, not a comma-separated list.** The `symbols` parameter uses OpenAPI `style: form, explode: true`, so each symbol is its own `symbols=` key:
>
> ```sh
> # Correct — repeated keys
> curl "$BASE_URL/orderbooks?symbols=SOMI:USDso&symbols=WETH:USDso"
>
> # Wrong — parsed as one literal symbol "SOMI:USDso,WETH:USDso", which matches
> # no market and is silently skipped, so the response is []
> curl "$BASE_URL/orderbooks?symbols=SOMI:USDso,WETH:USDso"
> ```
>
> Unknown or malformed symbols are silently skipped rather than erroring, so a serialization mismatch shows up as an empty `[]` rather than a 4xx. Most HTTP clients serialize an array parameter this way automatically (e.g. `axios`/`requests` with `params={"symbols": ["A", "B"]}`); if you build the query string by hand, repeat the key.

#### `GET /v0/orderbooks`

The same repeated-key serialization applies to every array-valued `symbols` parameter in this API (`/v0/tickers`, `/v0/orderbooks`).

For per-market ticker and candle data see [Trading](trading.md). The endpoint below returns 24-hour OHLCV statistics for one or more markets in a single call - omit `symbols` to cover every available market; unknown symbols are silently skipped.

#### `GET /v0/tickers`

Aggregate trading volume over a half-open time range `[since, until)`, returned in both scaled and raw token units for the base and quote so volume aggregators need no client-side decimal scaling. `until` defaults to 30 minutes ago and `since` to `until - 7 days`; the range must not exceed 40 days, and an `until` newer than 30 minutes ago is rejected to allow for ingestion latency.

#### `GET /v0/markets/{symbol}/volume`
