import { readFileSync, writeFileSync, readdirSync, copyFileSync } from "node:fs";
const DIR = "D:/imag/bug-reports/2026-11-07-dreamdex-perps-api-docs";
const REPO = "D:/imag/dreamdex-build-proof";

const W = "- Wallet address: none — this item is read-only and unauthenticated; nothing was signed.";
const S = "- SDK: not used for this item (public REST, and the WebSocket feed where noted).";
const S4 = "- SDK: `@somnia-chain/markets-sdk` 0.32.1 — `loadMarkets()` output is part of the evidence here.";

const labelFixes = [
  ["testnet (Tokyo 50383) via `https://stg.api.dreamdex.io/v0`",
   "testnet via `https://stg.api.dreamdex.io/v0` (what the bounty page calls **Somnia Tokyo testnet**; the SDK names it `somniaTestnet` / Shannon `50312`, and the HTTP docs print no chain id)"],
  ["(testnet, Tokyo 50383)", "(testnet — the bounty page's \"Somnia Tokyo\", Shannon `50312` per the SDK)"],
  ["(testnet Tokyo 50383)", "(testnet — \"Somnia Tokyo\" on the bounty page, Shannon `50312` per the SDK)"],
];

for (const f of readdirSync(`${DIR}/feedback`).filter((x) => x.endsWith(".md"))) {
  const p = `${DIR}/feedback/${f}`;
  let t = readFileSync(p, "utf8");
  for (const [a, b] of labelFixes) if (t.includes(a)) t = t.split(a).join(b);

  const head = "## Environment\n";
  const i = t.indexOf(head);
  if (i < 0) { console.log(`${f}: NO Environment`); continue; }
  const bodyStart = i + head.length;
  let bodyEnd = t.indexOf("\n## ", bodyStart);
  if (bodyEnd < 0) bodyEnd = t.length;
  let sec = t.slice(bodyStart, bodyEnd);
  sec = sec.split("\n").filter((l) => l.trim() !== W && l.trim() !== S && l.trim() !== S4).join("\n");
  sec = sec.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "\n");
  const add = [];
  if (!/wallet/i.test(sec)) add.push(W);
  if (!/sdk/i.test(sec)) add.push(f.startsWith("04") ? S4 : S);
  const newSec = add.length ? `${sec}\n${add.join("\n")}\n` : sec;
  t = t.slice(0, bodyStart) + newSec + t.slice(bodyEnd);
  writeFileSync(p, t);
  copyFileSync(p, `${REPO}/feedback/${f}`);
  console.log(`${f}: +${add.length}`);
}
const cp = `${DIR}/CONTACT.md`;
let c = readFileSync(cp, "utf8");
if (c.includes("(testnet Tokyo 50383)")) {
  writeFileSync(cp, c.split("(testnet Tokyo 50383)").join('(testnet — "Somnia Tokyo" per the bounty page, Shannon 50312 per the SDK)'));
  console.log("CONTACT.md: label fixed");
}
