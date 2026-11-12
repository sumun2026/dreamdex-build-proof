# Operations

The WebSocket API can also be used to call the HTTP API, via a system of ID-linked messages, utilising the same operations as provided by the OpenAPI spec. This allows a single client to perform multiple concurrent requests on a single WebSocket connection.

### Message Format

All messages are JSON objects with a request/response correlation ID. Responses may arrive out of order; correlate by `id`.

#### Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | yes | Client-provided request ID for correlating responses |
| `operation` | string | yes | OpenAPI operationId to invoke (case-insensitive) |
| `params` | object | no | Path and query parameters as key-value pairs |
| `bearerToken` | string | no | Bearer token for authenticated requests |
| `payload` | object | no | Request body for POST/PUT/PATCH operations |

```json
{
  "id": 1,
  "operation": "getMarkets",
  "params": {"symbol": "SOMI:USDso"},
  "bearerToken": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...",
  "payload": {}
}
```

#### Response

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | yes | Echoed from request for correlation |
| `status` | integer | yes | HTTP status code |
| `errorName` | string | no | Machine-readable error name (present on errors) |
| `payload` | object | no | Response body |

```json
{
  "id": 1,
  "status": 200,
  "payload": {}
}
```

#### Protocol Errors

If a request cannot be processed due to protocol issues (unknown operation, missing parameters, server overload), the server sends a protocol error instead of a regular response:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | yes | Always `"error"` |
| `errorName` | string | yes | Machine-readable error code |
| `message` | string | yes | Human-readable error description |
| `id` | integer | no | Request ID if available |

Possible `errorName` values: `unknown_operation`, `invalid_request`, `invalid_parameters`, `too_many_requests`, `internal_error`. See the [Errors](errors.md) page for detailed triggers and example messages.

```json
{
  "type": "error",
  "errorName": "unknown_operation",
  "message": "unknown operation: invalidOp",
  "id": 4
}
```

#### Heartbeat

Send `{"operation": "ping"}` to receive `{"operation": "pong"}`.&#x20;

Connections close after 60 seconds of inactivity.

### Request Examples

#### _getMarkets_

Fetch all markets

```json
{
  "id": 1,
  "operation": "getMarkets"
}
```

#### _getMarketSymbolOrder_

Fetch a specific order

```json
{
  "id": 2,
  "operation": "getMarketSymbolOrder",
  "params": {
    "symbol": "SOMI:USDso",
    "id": "01KC1F8N2NBP5GEYKE66CRJ34A"
  },
  "bearerToken": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### _prepareOrder_

Prepare a limit order transaction

```json
{
  "id": 3,
  "operation": "prepareOrder",
  "params": {
    "symbol": "SOMI:USDso"
  },
  "bearerToken": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...",
  "payload": {
    "type": "limit",
    "side": "buy",
    "price": "1.50",
    "amount": "100",
    "walletAddress": "0xaAaAaAaAaAbBbBbBbBbBcCcCcCcCcCdDdDdDdDdD"
  }
}
```

### Response Examples

#### _successResponse_

Successful response

```json
{
  "id": 1,
  "status": 200,
  "payload": {
    "markets": [
      {
        "symbol": "SOMI:USDso",
        "contract": "0x1234567890abcdef1234567890abcdef12345678",
        "base": "0xC732f848Ca9146840903cf5CC20481C4c56e0A11",
        "quote": "0x1e128F195b081Aa75CE1898227993D0994bf51e1",
        "baseDecimals": 18,
        "quoteDecimals": 6,
        "tickSize": "0.00001",
        "lotSize": "0.000001",
        "minQuantity": "0.001"
      }
    ]
  }
}
```

#### _errorResponse_

Error response

```json
{
  "id": 2,
  "status": 404,
  "errorName": "order_not_found",
  "payload": {
    "status": 404,
    "name": "order_not_found",
    "description": "The requested order was not found"
  }
}
```
