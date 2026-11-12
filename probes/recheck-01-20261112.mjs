const BASES = ["https://stg.api.dreamdex.io/v0", "https://api.dreamdex.io/v0"];
const CASES = [
  ["docs predict 200 []", "/orderbooks?symbols=SOMI:USDso,WETH:USDso"],
  ["docs predict 200 SOMI only", "/orderbooks?symbols=SOMI:USDso,FAKE:USDso"],
  ["docs predict 200 []", "/orderbooks?symbols=FAKE:USDso"],
  ["docs predict 200 []", "/orderbooks?symbols=SOMI"],
  ["docs predict 200", "/tickers?symbols=SOMI:USDso,FAKE:USDso"],
  ["docs predict 200 2 books (control)", "/orderbooks?symbols=SOMI:USDso&symbols=WETH:USDso"],
];
for (const b of BASES) {
  console.log(`\n######## ${b}  re-check ${new Date().toISOString()}`);
  for (const [expect, p] of CASES) {
    const r = await fetch(b + p, { headers: { accept: "application/json" } });
    const t = await r.text();
    console.log(`  ${String(r.status).padEnd(4)} ${p.padEnd(52)} docs: ${expect}`);
    if (r.status !== 200) console.log(`       body: ${t.slice(0, 160)}`);
    else console.log(`       body: ${t.slice(0, 90)}...`);
  }
}
