const NOW = Math.floor(Date.now() / 1000);
const fmt = ts => new Date(ts * 1000).toISOString();

const CASES = [
  ['SOMI default (no params)', '/markets/SOMI:USDso/volume'],
  ['SOMI true 7d', `/markets/SOMI:USDso/volume?since=${NOW - 7 * 86400}&until=${NOW - 1800}`],
  ['SOMI true 1d', `/markets/SOMI:USDso/volume?since=${NOW - 86400}&until=${NOW - 1800}`],
  ['SOMI true 30d', `/markets/SOMI:USDso/volume?since=${NOW - 30 * 86400}&until=${NOW - 1800}`],
  ['SOMI 41d (doc: must reject)', `/markets/SOMI:USDso/volume?since=${NOW - 41 * 86400}&until=${NOW - 3600}`],
  ['SOMI 400d (doc: must reject)', `/markets/SOMI:USDso/volume?since=${NOW - 400 * 86400}&until=${NOW - 3600}`],
  ['SOMI since=0', '/markets/SOMI:USDso/volume?since=0&until=' + (NOW - 3600)],
  ['SOMI until=now-1801s (1s inside window)', `/markets/SOMI:USDso/volume?since=${NOW - 86400}&until=${NOW - 1801}`],
  ['SOMI until=now-1799s (doc: reject)', `/markets/SOMI:USDso/volume?until=${NOW - 1799}`],
  ['SOMI until=now+3600 (future)', `/markets/SOMI:USDso/volume?since=${NOW - 86400}&until=${NOW + 3600}`],
  ['SOMI until=abc', `/markets/SOMI:USDso/volume?until=abc`],
  ['SOMI until=float', `/markets/SOMI:USDso/volume?until=${(NOW - 3600) + 0.5}`],
  ['tickers SOMI (unit check)', '/tickers?symbols=SOMI:USDso'],
  ['WETH default on MAINNET api', '/markets/WETH:USDso/volume'],
  ['WETH true 7d on MAINNET api', `/markets/WETH:USDso/volume?since=${NOW - 7 * 86400}&until=${NOW - 1800}`],
];

const BASES = ['https://stg.api.dreamdex.io/v0', 'https://api.dreamdex.io/v0'];
const recs = [];

for (const base of BASES) {
  console.log('\n########', base, ' NOW=' + NOW, fmt(NOW));
  for (const [name, p] of CASES) {
    if (base.endsWith('/v0') === false) break;
    const url = base + p;
    const rec = { base, name, url, now: NOW };
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 15000);
      const r = await fetch(url, { signal: ac.signal });
      clearTimeout(to);
      const txt = await r.text();
      let j = null; try { j = JSON.parse(txt); } catch { }
      rec.status = r.status;
      rec.headers = Object.fromEntries(r.headers.entries());
      rec.json = j ?? txt.slice(0, 300);
      if (j && 'since' in j) {
        rec.since = j.since; rec.until = j.until;
        rec.sinceDate = typeof j.since === 'number' ? fmt(j.since) : null;
        rec.spanDays = typeof j.since === 'number' && typeof j.until === 'number' ? ((j.until - j.since) / 86400).toFixed(1) : null;
        rec.baseVolume = j.baseVolume; rec.quoteVolume = j.quoteVolume;
      }
      if (j && Array.isArray(j.symbols) && j.symbols[0]?.lastTradeAt) {
        const lt = j.symbols[0].lastTradeAt;
        rec.lastTradeAtRaw = lt;
        rec.lastTradeAtAsMs = new Date(lt).toISOString();
        rec.lastTradeAtAsSec = (lt < 1e11) ? new Date(lt * 1000).toISOString() : 'value too large for seconds';
      }
    } catch (e) { rec.err = String(e.cause?.code || e.message); }
    recs.push(rec);
    const s = rec.status ?? 'ERR';
    const extra = rec.spanDays ? ` span=${rec.spanDays}d since=${rec.sinceDate} vol=${rec.baseVolume}` : '';
    const lta = rec.lastTradeAtRaw ? ` lastTradeAt=${rec.lastTradeAtRaw} asMs=${rec.lastTradeAtAsMs}` : '';
    const msg = rec.json && rec.json.description ? ' :: ' + rec.json.description : '';
    console.log(`${String(s).padStart(3)}  ${name.padEnd(38)}${extra}${lta}${msg}`);
  }
}

console.log('\n=== CORS / rate-limit headers seen ===');
const h = recs[0]?.headers || {};
console.log(Object.keys(recs.reduce((a, r) => { (r.headers || {}).constructor; for (const k in (r.headers || {})) a[k] = 1; return a; }, {})).join(', '));
for (const k of ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'server']) {
  console.log(k, '=', recs.map(r => r.headers?.[k]).filter(Boolean).slice(0, 3).join(' | ') || '(absent in all responses)');
}

import fs from 'node:fs';
fs.writeFileSync('probe-volume-control.json', JSON.stringify({ now: NOW, recs }, null, 1));
console.log('\nwrote probe-volume-control.json');
