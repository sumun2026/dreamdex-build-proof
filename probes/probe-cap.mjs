import fs from "node:fs";
const BASES = ["https://stg.api.dreamdex.io/v0", "https://api.dreamdex.io/v0"];
const D = 86400000;

async function get(base, path) {
  const r = await fetch(base + path, { headers: { accept: "application/json" } });
  return { status: r.status, body: await r.text() };
}

const out = {};
for (const base of BASES) {
  const L = [`\n######## ${base}  exact-span cap test  captured ${new Date().toISOString()}`];
  const anchor = (Math.floor(Date.now() / 1000) - 1800) * 1000; // until = now-30min, in ms
  for (const [label, spanMs] of [
    ["40d exactly      ", 40 * D],
    ["40d + 1s         ", 40 * D + 1000],
    ["40d + 60s        ", 40 * D + 60000],
    ["40d + 1799s      ", 40 * D + 1799000],
    ["40d + 1800s      ", 40 * D + 1800000],
    ["40d + 1801s      ", 40 * D + 1801000],
    ["40d + 2h         ", 40 * D + 7200000],
    ["40d + 1min       ", 40 * D + 60000],
    ["39d23h59m         ", 40 * D - 60000],
    ["41d              ", 41 * D],
  ]) {
    const res = await get(base, `/markets/SOMI:USDso/volume?since=${anchor - spanMs}&until=${anchor}`);
    const b = res.body.replace(/\s+/g, " ").slice(0, 110);
    L.push(`  ${String(res.status).padEnd(4)} ${label} span=${(spanMs / D).toFixed(8)}d  ${b}`);
  }
  out[base] = L.join("\n");
  console.log(out[base]);
}
fs.writeFileSync("probe-cap.json", JSON.stringify(out, null, 2));
