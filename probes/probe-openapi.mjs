// Before claiming "undocumented", look for the machine-readable spec these pages are generated from.
import { NETWORKS } from "./rest.js";

const candidates = [
  "https://api.dreamdex.io/v0/openapi.json",
  "https://api.dreamdex.io/openapi.json",
  "https://api.dreamdex.io/v0/docs/openapi.json",
  "https://api.dreamdex.io/v0/swagger.json",
  "https://app.dreamdex.io/openapi.json",
  "https://app.dreamdex.io/docs/openapi.json",
  "https://app.dreamdex.io/api/openapi.json",
  "https://stg.api.dreamdex.io/v0/openapi.json",
  "https://prd.smk.somnia.host/openapi.json",
];

for (const url of candidates) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    console.log(`${String(r.status).padEnd(4)} ${t.length.toString().padStart(8)}B ${url}`);
    if (r.ok && /openapi|swagger|paths/i.test(t.slice(0, 4000))) {
      console.log("    ^ looks like a spec — head:", t.slice(0, 200).replace(/\s+/g, " "));
    }
  } catch (e) {
    console.log(`ERR                 ${url}  (${e.name})`);
  }
}

// Does the rendered docs site expose the operation detail behind a separate route?
const deep = [
  "https://app.dreamdex.io/docs/developers/http-api/trading/candles",
  "https://app.dreamdex.io/docs/api-reference",
  "https://app.dreamdex.io/docs/developers/openapi",
];
for (const url of deep) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "follow" });
    const t = await r.text();
    const hasInterval = /\binterval\b/.test(t);
    const hasEnum = /(1m|5m|15m)/.test(t) && /interval/i.test(t);
    console.log(`${String(r.status).padEnd(4)} ${t.length.toString().padStart(8)}B interval=${hasInterval} intervalEnum=${hasEnum} ${url}`);
  } catch (e) {
    console.log(`ERR                 ${url} (${e.name})`);
  }
}
