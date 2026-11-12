import { writeFileSync, readFileSync } from "node:fs";

const UA = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
};

const PAGES = [
  "developers/http-api/market-data",
  "developers/http-api/error-handling",
  "developers/http-api/trading",
];

const QUOTES = [
  ["developers/http-api/market-data", "rather than a 4xx"],
  ["developers/http-api/market-data", "silently skipped"],
  ["developers/http-api/market-data", "# Wrong"],
  ["developers/http-api/market-data", "both **404**"],
  ["developers/http-api/error-handling", "consistent JSON format"],
  ["developers/http-api/error-handling", "Error-Name"],
];

for (const p of PAGES) {
  const url = `https://app.dreamdex.io/docs/${p}.md`;
  const r = await fetch(url, { headers: UA });
  const t = await r.text();
  const file = `docmd-20261112-${p.replace(/\//g, "_")}.md`;
  writeFileSync(file, t);
  console.log(`${r.status} ${String(t.length).padStart(6)} B  ${url}  -> ${file}`);
}

console.log("\n--- quoted sentences still present in the .md mirror? ---");
for (const [p, s] of QUOTES) {
  const t = readFileSync(`docmd-20261112-${p.replace(/\//g, "_")}.md`, "utf8");
  console.log(`${t.includes(s) ? "PRESENT" : "ABSENT "}  ${p}  ::  ${s}`);
}
