# Error Handling

All error responses use a consistent JSON format:

```json
{
  "status": 400,
  "name": "invalid_amount",
  "description": "invalid amount: strconv.ParseFloat: parsing \"abc\": invalid syntax"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | integer | HTTP status code |
| `name` | string | Machine-readable error name (see table below) |
| `description` | string | Human-readable explanation (may include internal details; do not display to end users) |

The `name` field is stable and intended for programmatic error handling. The `description` field may change between releases and is intended for debugging.

## Error Names

### Validation (400)

| Name | Description |
|------|-------------|
| `missing_field` | Required parameter or header is missing |
| `invalid_param` | Parameter has an invalid format or value |
| `invalid_request_body` | JSON body could not be parsed or fails schema validation |
| `invalid_amount` | Amount is not a valid decimal or violates the market's lot size |
| `invalid_price` | Price is not a valid decimal or violates the market's tick size |
| `invalid_currency` | Currency code is not part of the market pair |
| `invalid_order` | Order body could not be parsed |
| `invalid_order_type` | Unknown or unsupported order type, or an order type not permitted for the chosen `fundingSource` (see note below) |
| `invalid_order_id` | Order ID is not a valid format |
| `invalid_fund_source` | Funding source is incompatible with the chosen order type (see note below) |
| `invalid_interval` | Unsupported candle interval |
| `invalid_message` | SIWE message could not be parsed |

### Authentication (401 / 403)

| Name | Description |
|------|-------------|
| `unauthorized` | Missing or invalid bearer token |
| `invalid_nonce` | SIWE nonce is invalid or expired |
| `invalid_signature` | SIWE signature verification failed |
| `domain_mismatch` | SIWE domain does not match the server |
| `wallet_not_allowed` | Wallet is not authorized (403) |

### Not Found (404)

| Name | Description |
|------|-------------|
| `market_not_found` | Market symbol does not exist |
| `order_not_found` | Order ID does not exist |

### Server (500 / 503)

| Name | Description |
|------|-------------|
| `internal_error` | Unexpected server error |
| `rpc_unavailable` | Blockchain node is unreachable (503) |
| `not_implemented` | Endpoint is not yet implemented |

> [!NOTE]
> The `Error-Name` response header also contains the error name for quick inspection without parsing the body.

> [!WARNING]
> **Funding source and order type must be compatible.** `invalid_fund_source` / `invalid_order_type` mean the `fundingSource` + `orderType` combination on your [prepare-order](trading.md#post-v0marketssymbolorders) request is not accepted for that path. Resting maker types (GTC, PostOnly) settle through the vault / auto-pull `placeOrder` path. See the [funding source to function map](../contracts/functions.md#funding-source-to-function-map).
