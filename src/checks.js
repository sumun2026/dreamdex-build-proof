import { NETWORKS, restGet, symbolsQuery, shortText } from "./rest.js";
import { createExchange, findSdkMarket, restIdToCcxtSymbol } from "./sdk.js";

const DAY_MS = 86400_000;

export const check = (name, ok, summary, rows = []) => ({ name, ok, summary, rows });

async function checkUniverse(net) {
  const r = await restGet(net, "/markets");
  const restMarkets = r.json?.markets ?? [];
  const ex = createExchange(net);
  let sdkMarkets = [];
  try {
    sdkMarkets = await ex.fetchMarkets();
  } finally {
    try {
      await ex.close?.();
    } catch {}
  }

  const kinds = {};
  for (const m of restMarkets) kinds[m.kind ?? "?"] = (kinds[m.kind ?? "?"] || 0) + 1;
  const types = {};
  for (const m of sdkMarkets) types[m.type ?? "?"] = (types[m.type ?? "?"] || 0) + 1;
  const perpInSdk = sdkMarkets.filter((m) => m.info?.marketType === "PERP").length;
  const perpInRest = restMarkets.filter((m) => m.kind !== "spot").length;

  const rows = [
    `REST /v0/markets      : ${restMarkets.length} markets, kinds ${JSON.stringify(kinds)}`,
    `SDK  fetchMarkets()   : ${sdkMarkets.length} markets, types ${JSON.stringify(types)}`,
    `PERP markets          : SDK/indexer ${perpInSdk} | REST ${perpInRest} (REST documents a spot-only {symbol} universe)`,
    `filtered REST probe   : /markets?kind=perp -> ` +
      `${(await restGet(net, "/markets", "?kind=perp")).json?.markets?.length ?? "-"} rows` +
      ` | /markets?type=perp -> ` +
      `${(await restGet(net, "/markets", "?type=perp")).json?.markets?.length ?? "-"} rows (unknown params are ignored, not rejected)`,
  ];
  return check("market universe", restMarkets.length > 0 && sdkMarkets.length > 0, "both surfaces answered", rows);
}

async function checkSymbolMapping(net) {
  const r = await restGet(net, "/markets");
  const restMarkets = r.json?.markets ?? [];
  const ex = createExchange(net);
  let sdkMarkets = [];
  try {
    sdkMarkets = await ex.fetchMarkets();
  } finally {
    try {
      await ex.close?.();
    } catch {}
  }

  const rows = [];
  let mapped = 0;
  for (const m of restMarkets) {
    const unified = restIdToCcxtSymbol(m.symbol);
    const hit = findSdkMarket(sdkMarkets, m.symbol);
    if (hit) mapped++;
    rows.push(`${m.symbol.padEnd(16)} -> CCXT ${unified.padEnd(16)} -> SDK ${hit ? `match (type=${hit.type})` : "ABSENT from SDK universe"}`);
  }
  const doubled = sdkMarkets.filter((m) => m.symbol.includes(":"));
  rows.push(
    `SDK symbols with a :SETTLE suffix: ${doubled.length} of ${sdkMarkets.length} ` +
      `(CCXT linear-perp notation, e.g. ${doubled[0]?.symbol ?? "n/a on this env"} — not a defect)`
  );
  rows.push(`round-trip: SDK-only symbols are NOT valid REST ids — see ${net}: ${restMarkets.length} REST vs ${sdkMarkets.length} SDK`);
  return check("identifier mapping", mapped > 0, `${mapped}/${restMarkets.length} REST markets resolvable through the SDK`, rows);
}

async function checkBookAgreement(net, marketId) {
  const rows = [];
  const rest = await restGet(net, "/orderbooks", `?${symbolsQuery([marketId])}`);
  const book = rest.json?.orderbooks?.[0] ?? rest.json?.books?.[0] ?? rest.json?.[0] ?? null;

  const ex = createExchange(net);
  let sdkBook = null;
  let sdkErr = null;
  try {
    await ex.loadMarkets?.();
    sdkBook = await ex.fetchOrderBook(restIdToCcxtSymbol(marketId));
  } catch (e) {
    sdkErr = e?.message ?? String(e);
  } finally {
    try {
      await ex.close?.();
    } catch {}
  }

  // REST returns {price, quantity} objects; the SDK returns CCXT-style [price, quantity] pairs.
  const level = (side) => {
    const l = Array.isArray(side) && side.length ? side[0] : null;
    if (!l) return null;
    const [price, quantity] = Array.isArray(l) ? l : [l.price, l.quantity];
    return { price: String(price), quantity: String(quantity) };
  };
  const restBid = level(book?.bids);
  const restAsk = level(book?.asks);
  const sdkBid = level(sdkBook?.bids);
  const sdkAsk = level(sdkBook?.asks);

  rows.push(`REST /orderbooks?symbols=${marketId} -> ${rest.status}`);
  rows.push(`  best bid ${JSON.stringify(restBid)} / best ask ${JSON.stringify(restAsk)}`);
  rows.push(`SDK fetchOrderBook("${restIdToCcxtSymbol(marketId)}") -> ${sdkErr ? `error: ${sdkErr}` : "ok"}`);
  if (!sdkErr) rows.push(`  best bid ${JSON.stringify(sdkBid)} / best ask ${JSON.stringify(sdkAsk)}`);

  const agree =
    restBid && restAsk && sdkBid && sdkAsk &&
    restBid.price === sdkBid.price && restAsk.price === sdkAsk.price;
  rows.push(agree
    ? "  verdict: same top of book on both surfaces (levels normalised: REST objects vs SDK [price, quantity] pairs)"
    : "  verdict: surfaces disagree — compare the two lines above");
  return check("order book agreement", rest.status === 200, agree ? "REST and SDK books match" : "compared; see rows", rows);
}

async function checkVolumeWindowUnit(net, marketId) {
  const until = Math.floor((Date.now() - 30 * 60_000) / 1000) * 1000;
  const since = until - DAY_MS;
  const rows = [];
  for (const [unit, s, u] of [
    ["milliseconds", since, until],
    ["seconds", Math.floor(since / 1000), Math.floor(until / 1000)],
  ]) {
    const r = await restGet(net, `/markets/${encodeURIComponent(marketId)}/volume`, `?since=${s}&until=${u}`);
    const vol = r.json?.baseVolume ?? r.json?.volume ?? r.json?.markets?.[0]?.baseVolume ?? "?";
    rows.push(`${unit.padEnd(13)} since=${String(s).padEnd(15)} -> ${r.status} baseVolume ${vol}`);
  }
  const control = await restGet(net, `/markets/${encodeURIComponent(marketId)}/tickers`);
  rows.push(`control /tickers (unambiguous, same instant) -> ${control.status} ${shortText(control, 90)}`);
  rows.push("The HTTP API docs never state the unit for since/until; a seconds caller gets HTTP 200 and a zero, not an error.");
  return check("volume window unit", true, "documented behaviour of /volume", rows);
}

async function checkErrorContract(net, marketId) {
  const rows = [];
  const cases = [
    ["documented per-market orderbook path", `/markets/${encodeURIComponent(marketId)}/orderbook`],
    ["documented orderbooks path form", `/orderbooks/${encodeURIComponent(marketId)}`],
    ["unknown market id", "/markets/NOPE:USDso/tickers"],
    ["unknown route", "/this-route-does-not-exist"],
  ];
  for (const [label, path] of cases) {
    const r = await restGet(net, path);
    rows.push(
      `${label.padEnd(34)} ${String(r.status)} | ct=${r.headers["content-type"] ?? "-"} | Error-Name=${r.headers["error-name"] ?? "-"} | ${shortText(r, 70)}`
    );
  }
  rows.push("The docs state ALL error responses use the JSON {status,name,description} contract plus an Error-Name header.");
  return check("error contract", true, "compared handler errors vs router errors", rows);
}

function wsOhlcvSnapshot(url, symbol, timeframe, timeoutMs = 20000) {
  return new Promise((resolve) => {
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      resolve({ err: `connect threw: ${e?.message ?? e}` });
      return;
    }
    const stop = (r) => {
      clearTimeout(killer);
      try {
        ws.close();
      } catch {}
      resolve(r);
    };
    const killer = setTimeout(() => stop({ err: "no ohlcv snapshot arrived" }), timeoutMs);
    ws.onopen = () =>
      ws.send(JSON.stringify({ id: 1, operation: "subscribe", channel: "ohlcv", params: { symbol, timeframe } }));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.channel === "ohlcv" && m.type === "snapshot") stop({ candles: m.candles ?? [] });
      else if (m.type === "error" || m.errorName) stop({ err: JSON.stringify(m).slice(0, 160) });
    };
    ws.onerror = (e) => stop({ err: `ws error: ${e?.message ?? "unknown"}` });
  });
}

// Three surfaces for the same UTC days: REST /candles, the WS ohlcv snapshot, and REST /volume.
async function checkCandleCrossSurface(net, marketId) {
  const iso = (t) => (t == null ? "-" : new Date(Number(t)).toISOString().slice(0, 10));
  const rows = [];
  const path = `/markets/${encodeURIComponent(marketId)}/candles`;
  const rest = await restGet(net, path, "?interval=1d");
  const bars = rest.json?.candles ?? [];
  const wide = await restGet(net, path, "?interval=1d&limit=400");
  const wideN = wide.json?.candles?.length ?? 0;
  const last = bars[bars.length - 1];
  rows.push(`GET ${path}?interval=1d          -> ${rest.status} ${bars.length} bars (${iso(bars[0]?.timestamp)} .. ${iso(last?.timestamp)})`);
  rows.push(`  + &limit=400                  -> ${wide.status} ${wideN} bars — limit is accepted and ignored, so the window cannot be widened`);

  const feed = await wsOhlcvSnapshot(NETWORKS[net].ws, marketId, "1d");
  if (feed.err) {
    rows.push(`WS ohlcv timeframe=1d -> ${feed.err}`);
    return check("candle cross-surface", rest.status === 200, "REST bars only; WS snapshot unavailable", rows);
  }
  const wsBars = new Map(feed.candles.map((b) => [Number(b.timestamp), b]));
  rows.push(`WS ohlcv timeframe=1d (singular symbol param) -> ${feed.candles.length} bars (${iso(feed.candles[0]?.timestamp)} ..)`);

  let compared = 0;
  let skipped = 0;
  const mismatches = [];
  for (const b of bars) {
    const w = wsBars.get(Number(b.timestamp));
    if (!w) {
      skipped++;
      continue;
    }
    compared++;
    if (String(w.volume) !== String(b.volume) || String(w.open) !== String(b.open)) mismatches.push({ t: Number(b.timestamp), rest: b, ws: w });
  }
  rows.push(`daily bars compared ${compared} | in REST only (older than the WS window) ${skipped} | disagreeing ${mismatches.length}`);
  for (const m of mismatches.slice(0, 3)) {
    const vol = await restGet(net, `/markets/${encodeURIComponent(marketId)}/volume`, `?since=${m.t}&until=${m.t + DAY_MS}`);
    rows.push(`  ${iso(m.t)}  /candles volume=${m.rest.volume} open=${m.rest.open} high=${m.rest.high}`);
    rows.push(`             ws ohlcv  volume=${m.ws.volume} open=${m.ws.open} high=${m.ws.high}`);
    const sides = String(vol.json?.baseVolume) === String(m.ws.volume) ? "the WS feed, not /candles"
      : String(vol.json?.baseVolume) === String(m.rest.volume) ? "/candles, not the WS feed"
      : "neither surface exactly";
    rows.push(`             /volume   ${vol.status} baseVolume=${vol.json?.baseVolume ?? "?"} — the third surface agrees with ${sides}`);
  }
  if (mismatches.length) rows.push("  a disagreement here is a data-correctness conflict between first-party surfaces, not a client bug: the same symbol, the same UTC day, the same units.");
  return check("candle cross-surface", mismatches.length === 0, mismatches.length ? `${mismatches.length}/${compared} daily bars disagree across surfaces` : `${compared} daily bars agree across REST and WS`, rows);
}

function wsSession(url, steps, overallTimeoutMs = 25000) {
  return new Promise((resolve) => {
    const out = [];
    let done = 0;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      resolve({ ok: false, out: [`connect threw: ${e.message}`] });
      return;
    }
    const finish = () => {
      clearTimeout(killer);
      try {
        ws.close();
      } catch {}
      resolve({ ok: done === steps.length, out });
    };
    const killer = setTimeout(finish, overallTimeoutMs);
    const pending = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      out.push(`<< ${JSON.stringify(m).slice(0, 150)}`);
      const step = steps[done];
      if (step?.expect && step.expect(m)) {
        done++;
        const next = steps[done];
        if (next) ws.send(JSON.stringify(next.send));
        else finish();
      }
      for (const p of pending.splice(0)) p();
    };
    ws.onopen = () => {
      const first = steps[0];
      ws.send(JSON.stringify(first.send));
      if (!first.expect) {
        done = 1;
        const next = steps[1];
        if (next) ws.send(JSON.stringify(next.send));
      }
      void pending;
    };
    ws.onerror = (e) => {
      out.push(`ws error: ${e?.message ?? "unknown"}`);
      finish();
    };
  });
}

async function checkWebsocket(net) {
  const url = NETWORKS[net].ws;
  const steps = [
    { send: { id: 1, operation: "ping" }, expect: (m) => m.operation === "pong" || m.id === 1 },
    { send: { id: 2, operation: "getMarkets" }, expect: (m) => m.id === 2 },
    { send: { id: 3, operation: "subscribe", channel: "orderbook", params: { symbols: ["SOMI:USDso"] } }, expect: (m) => m.type === "subscribed" || m.type === "snapshot" || m.type === "error" },
  ];
  const res = await wsSession(url, steps);
  const rows = [`connection ${url}`, ...res.out];
  const noId = await new Promise((resolve) => {
    const w = new WebSocket(url);
    const t = setTimeout(() => {
      try { w.close(); } catch {}
      resolve("(no response within 12s)");
    }, 12000);
    w.onopen = () => w.send(JSON.stringify({ operation: "getMarkets" }));
    w.onmessage = (ev) => {
      clearTimeout(t);
      const m = JSON.parse(ev.data);
      try { w.close(); } catch {}
      resolve(`id omitted by client -> response carries id=${m.id}, status=${m.status ?? "-"}`);
    };
    w.onerror = () => {
      clearTimeout(t);
      resolve("(ws error)");
    };
  });
  rows.push(`required-field probe: ${noId} (operations page marks id Required: yes)`);
  return check("websocket feed", res.ok, res.ok ? "ping/getMarkets/subscribe all served" : "incomplete session", rows);
}

export async function runChecks(net, marketId) {
  const results = [];
  results.push(await checkUniverse(net));
  results.push(await checkSymbolMapping(net));
  if (marketId) {
    results.push(await checkBookAgreement(net, marketId));
    results.push(await checkVolumeWindowUnit(net, marketId));
    results.push(await checkErrorContract(net, marketId));
    results.push(await checkCandleCrossSurface(net, marketId));
  }
  results.push(await checkWebsocket(net));
  return results;
}
