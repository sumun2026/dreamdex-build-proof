# WebSocket: omitting the required `id` executes the request and echoes `id: 0` instead of an error

Severity: normal
Area: API, docs

## Summary

The WebSocket operations page marks request `id` as **Required: yes**. In practice a message with no
`id` is accepted and dispatched normally, and the server answers with `id: 0`. Because `0` is the
value used for *every* id-less request on that connection, a client that forgets the field gets
correlated-looking responses that cannot be correlated — and never learns it made a mistake, because
no error is returned.

The documented failure mode for a protocol-level problem is a `type: "error"` message; here the
server silently treats a missing required field as `0`.

## Steps to reproduce

The documented request table (https://app.dreamdex.io/docs/developers/websocket-api/operations) says:

| Field | Type    | Required | Description                                   |
|-------|---------|----------|-----------------------------------------------|
| `id`  | integer | **yes**  | Client-provided request ID for correlating responses |
| `operation` | string | yes | OpenAPI operationId to invoke (case-insensitive) |

Run this against the live public feed:

```js
// node 22+, no dependencies
const ws = new WebSocket("wss://api.dreamdex.io/v0/ws/public");
ws.onopen = () => {
  ws.send(JSON.stringify({ operation: "getMarkets" }));   // no "id" field at all
};
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  console.log("id =", m.id, " status =", m.status, " hasPayload =", !!m.payload);
  process.exit(0);
};
```

Actual output, 2026-11-08:

```
id = 0  status = 200  hasPayload = true
```

Send two of them back to back and both responses come labelled `id: 0`.

**Second manifestation — two doc pages contradict each other about `id` on the pong.** The Response
table on the operations page states:

| Field | Type    | Required | Description                      |
|-------|---------|----------|----------------------------------|
| `id`  | integer | **yes**  | Echoed from request for correlation |
| `status` | integer | **yes** | HTTP status code              |

but the real-time-feed page defines the pong message as carrying **only** `operation`:

> `pong` — Message Format → Required: `operation`, string, `"pong"`.

and in practice a ping sent *with* an `id` receives no `id` and no `status`:

```js
ws.send(JSON.stringify({ id: 1, operation: "ping" }));
// << {"operation":"pong","serverTimestamp":1794080426835}
```

So the server is consistent with the pong schema and inconsistent with the general Response table —
which of the two pages is authoritative is what needs fixing. A client that keys outstanding requests
on `id` gets `undefined` for every pong, which is the one message type it most needs to correlate in
order to prove the socket is still alive. **The ask here is documentation: either exclude heartbeats
from the Response table, or add `id` to the pong schema.** Not a claim that the server is broken.

For contrast, a *present* `id` is echoed correctly on real responses, and the sibling protocol
errors do fire — `{"id":4}` (no operation) → `invalid_request "missing operation field"`,
`{"id":3,"operation":"invalidOp"}` → `unknown_operation`. So the validator covers `operation` but
not `id`.

## Expected

Either reject the message with the documented `invalid_request` error (the field is required), or —
if `id` is genuinely optional — document it as optional and say what the response is labelled.

## Actual

The request is executed and every id-less response is labelled `id: 0`, indistinguishable from a
real request that used id `0`. The errors page compounds this by stating:

> "The `id` field echoes the request ID **when available**, allowing clients to correlate errors
> with specific requests."

"When available" implies it may be absent; the operations table says it is required. The two pages
disagree, and the server's behaviour matches neither — it substitutes `0` rather than omitting.

### Why this matters for a bot

A builder authenticating over WS reuses one connection for `getMarkets`, `prepareOrder`, and
`order` updates. If any call site drops the `id`, its response is silently attributed to `0`. A
client keyed by `id` will either collide two unrelated responses or hang waiting for a `0` it already
consumed — a mis-attributed order response, not a visible error.

## Evidence

- Live WS session against `wss://api.dreamdex.io/v0/ws/public`, 2026-11-08; transcript in
  `probes/probe-ws.json` (case 7: `{"operation":"getMarkets"}` → `{"id":0,"status":200,"payload":{…}}`).
- Re-run script: `probes/probe-ws.mjs` (10 cases, both mainnet and testnet; testnet reproduces).
- Operations page fetched live, HTTP 200 (`src/LIVE_developers_websocket-api_operations.txt`).

## What is *not* claimed

Not reported here, on purpose:

- `subscription_failed` **is** documented (operations/errors page) — no finding.
- Unparseable JSON returns `"invalid JSON message"` where the errors page shows `"invalid JSON request"`.
  The vendor's own error-handling page says example `description`/message strings may change between
  releases, so a wording delta is not treated as a contract break by us.
- Unknown/absent `id` still works for the *response* path; we are not claiming any data loss, only
  silent contract divergence and lost correlation.

## Environment

- `wss://api.dreamdex.io/v0/ws/public` (mainnet, chain 5031) — reproduces.
- `wss://stg.api.dreamdex.io/v0/ws/public` (Shannon, 50312) — reproduces.
- Unauthenticated public feed, read-only operations; no keys, no signatures, no writes.
- Wallet address: none — this item is read-only and unauthenticated; nothing was signed.
- SDK: not used for this item (public REST, and the WebSocket feed where noted).
