# A fill has two different `id` values depending on which dreamDEX surface reads it, and the only shared field (`timestamp`) is not unique

Severity: major
Area: API

## Summary

For the **same fill**, `GET /v0/markets/{symbol}/trades` and the WebSocket `trades` channel return
**different `id` strings in different formats**, and they rename the size field (`amount` vs `quantity`).
Measured on mainnet `SOMI:USDso`: **4 of 4** live WS trade updates pair with a REST row by timestamp, and
**0 of 4** share an `id`. Across a full REST page, **0 of 100** REST ids appear in the WS stream and
**0 of 4** WS ids appear in REST.

That leaves a builder with **no key that works on both surfaces**. The only field present in both records
with the same value is `timestamp` — and `timestamp` is demonstrably not unique: in the current 100-row
REST page there are 99 unique timestamps, i.e. **one collision**, and that collision is a single
transaction split into two fills (same `txHash`, same millisecond, different prices):

```json
{"amount":"27","cost":"4.3146","id":"4334984857321778181893:4242751136953230423781","price":"0.1598",
 "side":"buy","symbol":"SOMI:USDso","timestamp":1794445977321,
 "txHash":"0x625ffbf4087927eb33cdf7cecd3d5313d28f3ca716b590d5b0059cdd9c2e7a09"}
{"amount":"572.4","cost":"91.41228","id":"4334984857321778181893:2582544170319370778368","price":"0.1597",
 "side":"buy","symbol":"SOMI:USDso","timestamp":1794445977321,
 "txHash":"0x625ffbf4087927eb33cdf7cecd3d5313d28f3ca716b590d5b0059cdd9c2e7a09"}
```

`2026-11-12T01:12:57.321Z` — one trade, two fills, one millisecond, and no field other than `id` that
distinguishes them. So the usual reconciliation pattern is not merely awkward, it is **wrong**: it either
drops a real fill or counts one twice.

## The two records, side by side

Live WS update and the REST row for the same fill, from one run
(`probes/trade-id-cross-surface.log`):

| | WS `trades` update | REST `/markets/{symbol}/trades` |
|---|---|---|
| `id` | `1794447058934-0` | `2102928824402922438429:4334984857321778183947` |
| size field | `quantity: "1.07"` | `amount: "1.07"` |
| `price` | `"0.1594"` | `"0.1594"` |
| `side` | `sell` | `sell` |
| `timestamp` | `1794447058713` | `1794447058713` |
| extra | — | `cost`, `symbol`, `txHash` |
| keys present | `id, price, quantity, side, timestamp` | `amount, cost, id, price, side, symbol, timestamp, txHash` |

All four live pairs look like that. The formats are not variants of one scheme: the WS id is a
`<millisecond>-<sequence>` stream cursor (we also observed `1794447063757-23`, i.e. sequence 23 inside one
millisecond), while the REST id is a `<big-number>:<big-number>` pair. Neither form is a substring, suffix
or readable transform of the other, and the REST rows carry no `-N`-style id at all (`false` for all 100).

## Steps to reproduce

No authentication, no keys, no writes.

```sh
# 1. subscribe to the trades channel (array form of `symbols`, the shape that gets "subscribed")
node -e '
const ws=new WebSocket("wss://api.dreamdex.io/v0/ws/public");
ws.onopen=()=>ws.send(JSON.stringify({id:1,operation:"subscribe",channel:"trades",params:{symbols:["SOMI:USDso"]}}));
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.type==="update") console.log("WS ",JSON.stringify(m.trade));};
' 
#   WS  {"id":"1794447058934-0","price":"0.1594","quantity":"1.07","side":"sell","timestamp":1794447058713}

# 2. read the same fill from REST
curl -s "https://api.dreamdex.io/v0/markets/SOMI%3AUSDso/trades" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const r=JSON.parse(s).trades.find(t=>t.timestamp===1794447058713);
      console.log("REST",JSON.stringify(r)); })'
#   REST {"amount":"1.07","cost":"0.170558","id":"2102928824402922438429:4334984857321778183947",
#         "price":"0.1594","side":"sell","symbol":"SOMI:USDso","timestamp":1794447058713,
#         "txHash":"0xe0d01d14232e7bb0237feed4a83830d9796196027bb79871977ca2fe6e1f493c"}
```

```sh
# 3. prove the timestamp fallback is unsafe
curl -s "https://api.dreamdex.io/v0/markets/SOMI%3AUSDso/trades" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const t=JSON.parse(s).trades, m=new Map();
      for(const r of t){ (m.get(r.timestamp)??m.set(r.timestamp,[]).get(r.timestamp)).push(r); }
      const dup=[...m].filter(([,v])=>v.length>1);
      console.log(t.length,"rows,",m.size,"unique timestamps,",dup.length,"collision(s)");
      for(const [ts,v] of dup) console.log(ts, v.length, "fills, same txHash:", new Set(v.map(r=>r.txHash)).size===1, JSON.stringify(v));
    })'
```

`probes/trade-id-cross-surface.mjs` does all of the above in one run and prints the pairs, the four
intersection counts, and the collision rate.

## Why this matters

- The documented way to build a fill history is **stream the WS, then backfill from REST** (the WS
  `trades` snapshot only returns the last few rows, and a socket drops — idle close is ~60 s, which the
  docs state and we measured at 60,453 ms). To merge the two, a client must recognise that
  `id 1794447058934-0` **is** `id 2102928824402922438429:4334984857321778183947`. Nothing in either
  response lets it.
- Falling back to `timestamp` silently corrupts the record exactly when a maker/taker order is split in
  one block, which is the common case rather than the exotic one — the observed collision is a single
  `txHash` producing two fills, and the WS cursor `…-23` shows the stream itself numbering fills inside a
  millisecond.
- The size field is named `quantity` on one surface and `amount` on the other, so a shared parser needs a
  per-source mapping on top of the id problem.
- A trader reconciling fills against their own order flow cannot tell a **missed** WS trade from an
  **already-seen** one, which is the failure mode that costs money rather than the one that costs time.

## Expected

Either one `id` scheme shared by REST and the WebSocket feed (so a client can de-duplicate and detect
gaps), or a documented, reliable join key — for example REST returning the stream cursor alongside its
own id, or the WS frame carrying the REST `id` — plus a documented note on whether `timestamp` is
guaranteed unique per fill. If the two id spaces are deliberately separate, that needs saying on the
WebSocket page, because today the field is called `id` in both and nothing marks them as unrelated.

## Actual

The same fill has two unrelated `id` values, the size field changes name between surfaces, and the one
field that does match (`timestamp`) collides in the current data.

## Evidence

- `probes/trade-id-cross-surface.mjs` + `probes/trade-id-cross-surface.log` — the 4 live pairs, the
  `0/100` and `0/4` id intersections, `timestamp collisions: 1 of 100`, and the key-set diff.
- `probes/ws-trades-quiet-1111.mjs` + `probes/ws-trades-quiet-1111.log` — a 300 s instrumented watch that
  is included here as the **control**: the `trades` channel delivered 14/14 fills that REST showed in the
  same window, so this report is *not* a claim that the stream misses trades. It only shows the two
  surfaces cannot be joined.
- `probes/ws-live-update-1111.mjs` + `probes/ws-live-update-1111-run2.log` — the shape discovery:
  `trades` subscribes with `symbols` as an **array** (a bare string gets
  `subscription_failed`), while `ohlcv` takes a singular string `symbol`.

## What is *not* claimed

- No claim that the WS feed loses trades. Measured the other way: 14 of 14 delivered (see the control).
- No claim that any specific format is intended or accidental — we only show that the two surfaces
  disagree on the identifier for the same event.
- No security implication: both ids are read-only public data, no order, wallet or auth material is
  involved.
- Single market (`SOMI:USDso`), mainnet only; the testnet environment was not swept for this item.

## Environment

- mainnet `https://api.dreamdex.io/v0` + `wss://api.dreamdex.io/v0/ws/public` (chain 5031)
- `@somnia-chain/markets-sdk` not involved in this item — raw REST and the public WebSocket feed only.
- Node 21+ global `fetch`/`WebSocket`; unauthenticated `GET`s and one public `subscribe` — no keys, no
  signature, no writes.

- Wallet address: none — this item is read-only and unauthenticated; nothing was signed.
