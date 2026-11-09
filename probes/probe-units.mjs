const NOW = Math.floor(Date.now() / 1000);
const fmtS = ts => new Date(ts * 1000).toISOString();
const BASES = ['https://stg.api.dreamdex.io/v0', 'https://api.dreamdex.io/v0'];

async function get(url) {
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(to);
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch { }
    return { status: r.status, j, txt: txt.slice(0, 200), url };
  } catch (e) { return { status: 'ERR', txt: String(e.cause?.code || e.message), url }; }
}

const out = [];
for (const base of BASES) {
  console.log('\n########', base, 'NOW(s)=', NOW, fmtS(NOW));

  // CONTROL: is there real trading activity in the last 24h?
  const tk = await get(`${base}/tickers?symbols=SOMI:USDso`);
  const t = tk.j?.symbols?.[0];
  console.log(`  CONTROL /tickers 24h SOMI -> ${t ? JSON.stringify(t) : tk.txt}`);

  const weth = await get(`${base}/tickers?symbols=WETH:USDso`);
  console.log(`  CONTROL /tickers 24h WETH -> ${JSON.stringify(weth.j?.symbols?.[0] ?? weth.txt).slice(0, 220)}`);

  const probes = [
    ['A seconds 1d',   `/markets/SOMI:USDso/volume?since=${NOW - 86400}&until=${NOW - 1800}`],
    ['B millis  1d',   `/markets/SOMI:USDso/volume?since=${(NOW - 86400) * 1000}&until=${(NOW - 1800) * 1000}`],
    ['C millis  7d',   `/markets/SOMI:USDso/volume?since=${(NOW - 7 * 86400) * 1000}&until=${(NOW - 1800) * 1000}`],
    ['D millis  30d',  `/markets/SOMI:USDso/volume?since=${(NOW - 30 * 86400) * 1000}&until=${(NOW - 1800) * 1000}`],
    ['E millis 41d (cap?)', `/markets/SOMI:USDso/volume?since=${(NOW - 41 * 86400) * 1000}&until=${(NOW - 1800) * 1000}`],
    ['F millis until=now*1000 (future?)', `/markets/SOMI:USDso/volume?since=${(NOW - 86400) * 1000}&until=${NOW * 1000}`],
    ['G mixed: since s, until ms', `/markets/SOMI:USDso/volume?since=${NOW - 86400}&until=${(NOW - 1800) * 1000}`],
    ['H WETH millis 1d', `/markets/WETH:USDso/volume?since=${(NOW - 86400) * 1000}&until=${(NOW - 1800) * 1000}`],
    ['I WETH seconds 1d', `/markets/WETH:USDso/volume?since=${NOW - 86400}&until=${NOW - 1800}`],
    ['J default (no params) raw echo', `/markets/SOMI:USDso/volume`],
    ['K orderbook 24h cross-check SOMI', `/orderbooks?symbols=SOMI:USDso`],
  ];

  for (const [name, p] of probes) {
    const r = await get(base + p);
    const j = r.j || {};
    const line = { base, name, status: r.status, since: j.since, until: j.until, baseVolume: j.baseVolume, quoteVolume: j.quoteVolume, desc: j.description ?? (typeof r.txt === 'string' ? r.txt.slice(0, 90) : '') };
    out.push({ ...line, raw: r.j ?? r.txt });
    const echo = (typeof j.since === 'number') ? ` since=${j.since}(${new Date(j.since < 1e11 ? j.since * 1000 : j.since).toISOString()})` : ` since=${j.since}`;
    const u = (typeof j.until === 'number') ? ` until=${j.until}(${new Date(j.until < 1e11 ? j.until * 1000 : j.until).toISOString()})` : ` until=${j.until}`;
    console.log(`  ${String(r.status).padStart(3)} ${name.padEnd(34)}${echo}${u}  baseVol=${j.baseVolume} quoteVol=${j.quoteVolume}  ${line.desc ? '| ' + String(line.desc).slice(0, 70) : ''}`);
  }
}
import fs from 'node:fs';
fs.writeFileSync('probe-units.json', JSON.stringify({ now: NOW, out }, null, 1));
console.log('\nwrote probe-units.json');
