const BASES = ["https://stg.api.dreamdex.io/v0", "https://api.dreamdex.io/v0"];
const PATHS = ["/markets/SOMI:USDso/orderbook", "/orderbooks/SOMI:USDso", "/nonexistent-route", "/orderbooks"];
for (const b of BASES) {
  console.log(`\n######## ${b}  re-check ${new Date().toISOString()}`);
  for (const p of PATHS) {
    const r = await fetch(b + p);
    const t = await r.text();
    console.log(`  ${r.status} ${p}`);
    console.log(`        content-type: ${r.headers.get("content-type")}`);
    console.log(`        Error-Name  : ${r.headers.get("error-name") ?? "(absent)"}`);
    console.log(`        body        : ${t.slice(0, 120).replace(/\n/g, " ")}`);
  }
}
