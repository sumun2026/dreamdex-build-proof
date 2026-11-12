const BASES = ["https://stg.api.dreamdex.io/v0", "https://api.dreamdex.io/v0"];
const M = "SOMI:USDso";
const nowS = Math.floor(Date.now() / 1000);
const get = async (u) => { const r = await fetch(u); return { s: r.status, t: await r.text() }; };
for (const b of BASES) {
  console.log(`\n######## ${b}  re-check ${new Date().toISOString()}`);
  const A = await get(`${b}/markets/${M}/volume?since=${nowS - 86400}&until=${nowS - 1800}`);
  const B = await get(`${b}/markets/${M}/volume?since=${(nowS - 86400) * 1000}&until=${(nowS - 1800) * 1000}`);
  const C = await get(`${b}/tickers?symbols=${M}`);
  const D = await get(`${b}/markets/${M}/volume?since=0&until=86400`);
  console.log(`  A seconds 1d  -> ${A.s} ${A.t.slice(0, 150)}`);
  console.log(`  B millis  1d  -> ${B.s} ${B.t.slice(0, 150)}`);
  console.log(`  C control     -> ${C.s} ${C.t.slice(0, 150)}`);
  console.log(`  D since=0     -> ${D.s} ${D.t.slice(0, 150)}`);
  const aj = JSON.parse(A.t), bj = JSON.parse(B.t);
  console.log(`  echo: A since=${aj.since} until=${aj.until} (span ${((aj.until - aj.since) / 1000).toFixed(0)}s) baseVolume=${aj.baseVolume}`);
  console.log(`        B since=${bj.since} until=${bj.until} (span ${((bj.until - bj.since) / 86400000).toFixed(4)}d) baseVolume=${bj.baseVolume}`);
}
