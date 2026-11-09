const BASES = ['https://stg.api.dreamdex.io/v0', 'https://api.dreamdex.io/v0'];

const CASES = [
  ['markets', '/markets'],
  ['currencies', '/currencies'],
  ['orderbooks SOMI', '/orderbooks?symbols=SOMI:USDso'],
  ['orderbooks comma', '/orderbooks?symbols=SOMI:USDso,WETH:USDso'],
  ['orderbooks repeated', '/orderbooks?symbols=SOMI:USDso&symbols=WETH:USDso'],
  ['orderbooks garbage', '/orderbooks?symbols=NOT:A%3AMARKET'],
  ['orderbooks empty', '/orderbooks?symbols='],
  ['orderbooks no param', '/orderbooks'],
  ['path form A (doc says 404)', '/markets/SOMI:USDso/orderbook'],
  ['path form B (doc says 404)', '/orderbooks/SOMI:USDso'],
  ['tickers', '/tickers'],
  ['tickers comma', '/tickers?symbols=SOMI:USDso,WETH:USDso'],
  ['volume default', '/markets/SOMI:USDso/volume'],
  ['volume until=now (doc: rejected)', `/markets/SOMI:USDso/volume?until=${Math.floor(Date.now() / 1000)}`],
  ['volume until=5min ago (doc: rejected)', `/markets/SOMI:USDso/volume?until=${Math.floor(Date.now() / 1000) - 300}`],
  ['volume until=45min ago', `/markets/SOMI:USDso/volume?until=${Math.floor(Date.now() / 1000) - 2700}`],
  ['volume range 41d (doc: rejected)', `/markets/SOMI:USDso/volume?since=${Math.floor(Date.now() / 1000) - 41 * 86400}&until=${Math.floor(Date.now() / 1000) - 3600}`],
  ['volume range 40d (doc: ok)', `/markets/SOMI:USDso/volume?since=${Math.floor(Date.now() / 1000) - 40 * 86400}&until=${Math.floor(Date.now() / 1000) - 3600}`],
  ['volume since>until', `/markets/SOMI:USDso/volume?since=${Math.floor(Date.now() / 1000)}&until=${Math.floor(Date.now() / 1000) - 7200}`],
  ['volume negative since', '/markets/SOMI:USDso/volume?since=-1&until=100'],
  ['volume garbage symbol', '/markets/NOT:A%3AMARKET/volume'],
];

const out = [];
for (const base of BASES) {
  for (const [name, p] of CASES) {
    const url = base + p;
    const t0 = Date.now();
    let rec = { base, name, url, ms: 0 };
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 15000);
      const r = await fetch(url, { signal: ac.signal, headers: { accept: 'application/json' } });
      clearTimeout(to);
      const text = await r.text();
      rec.ms = Date.now() - t0;
      rec.status = r.status;
      rec.ct = r.headers.get('content-type');
      rec.allowOrigin = r.headers.get('access-control-allow-origin');
      rec.len = text.length;
      rec.body = text.slice(0, 260).replace(/\s+/g, ' ');
    } catch (e) {
      rec.ms = Date.now() - t0;
      rec.err = String(e.cause?.code || e.message).slice(0, 120);
    }
    out.push(rec);
    console.log(`${r2(rec.status)} ${String(rec.ms).padStart(5)}ms  ${base.replace('https://','')}  ${name}  ::  ${(rec.body || rec.err || '').slice(0, 120)}`);
  }
}
function r2(s) { return String(s ?? 'ERR').padStart(3); }
console.log('\n=== header sample ===');
try {
  const r = await fetch(BASES[0] + '/markets');
  console.log([...r.headers.entries()].map(([k, v]) => k + ': ' + v).join('\n'));
} catch (e) { console.log('header fetch failed', e.message); }
import fs from 'node:fs';
fs.writeFileSync('probe-market.json', JSON.stringify(out, null, 1));
