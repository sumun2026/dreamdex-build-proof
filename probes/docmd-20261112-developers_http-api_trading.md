# Trading

These endpoints provide access to trade history, ticker snapshots, and candlestick data for a given market. The [Order Management](#order-management) section covers preparing, querying, reducing, and cancelling orders, and [Trade History](#trade-history) returns your executed fills.

Note that the prepare-order endpoint returns an **unsigned transaction** — the client must sign and broadcast it to the Somnia network. See the [Quick Start](../../welcome/quick-start.md) guide for a full walkthrough.

> [!WARNING]
> **Taker orders need a crossing limit price.** A marketable (IOC/FOK) order only fills against resting liquidity priced at or through its limit: a buy must price at or above the best ask, a sell at or below the best bid. A price of `0` (raw `priceRaw = 0`) never crosses the book and produces no fill. Set a limit that crosses, bounded by your slippage tolerance.

#### `GET /v0/markets/{symbol}/trades`

#### `GET /v0/markets/{symbol}/tickers`

#### `GET /v0/markets/{symbol}/candles`

## Order Management

#### `POST /v0/markets/{symbol}/orders`

#### `GET /v0/markets/{symbol}/orders/{id}`

A resting order can be shrunk without cancelling it. `newQuantityRemaining` must be at or below the current remaining quantity, at least `minQuantity`, and a multiple of `lotSize`; the order's `fullQuantity` and `quantityRemaining` both decrease by the difference. Like placing an order, this returns an unsigned transaction to sign and broadcast.

#### `PATCH /v0/markets/{symbol}/orders/{id}/reduce`

#### `DELETE /v0/markets/{symbol}/orders/{id}`

#### `GET /v0/markets/{symbol}/orders`

To fetch open and historical orders across several markets in one call, use the unscoped endpoint below. Omit `symbols` to cover every available market; unknown symbols are silently skipped.

#### `GET /v0/orders`

## Trade History

These endpoints return executed fills for the authenticated account. They include trades where the account was either the taker or the maker, returned newest-first. The market-scoped `trades/mine` and the unscoped `/v0/trades` (which spans several markets in one call and tags each trade with its symbol) operate on the caller's own account. The `trades/{address}` variant returns fills for any wallet and is restricted to bearer tokens carrying the `trades:read_any` scope.

#### `GET /v0/markets/{symbol}/trades/mine`

#### `GET /v0/trades`

#### `GET /v0/markets/{symbol}/trades/{address}`
