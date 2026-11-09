import { readFileSync } from "node:fs";
const h = readFileSync(process.argv[2], "utf8");
const keys = ["endDate", "startDate", "deadline", "applications_deadline", "start_date", "end_date",
  "status", "type", "max_bonus", "total_prize", "is_ended", "registration_deadline", "track"];
const unesc = (s) => s.replace(/\\+"/g, '"').replace(/\\"/g, '"');
for (const k of keys) {
  const re = new RegExp('\\\\?"' + k + '\\\\?"\\s*:\\s*\\\\?"([^"\\\\]{1,70})', "g");
  const hits = [...h.matchAll(re)].map((m) => unesc(m[1]));
  if (hits.length) console.log(k.padEnd(24), [...new Set(hits)].slice(0, 8).join("   |   "));
}
console.log("\n--- date-shaped strings in payload:");
const dates = new Set([...h.matchAll(/20\d\d-\d\d-\d\dT?\d{0,8}/g)].map((m) => m[0]));
console.log([...dates].sort().join("  "));
console.log("\n--- 'Nov' mentions:");
for (const m of new Set([...h.matchAll(/Nov(?:ember)? \d{1,2}(?:,? 20\d\d)?/g)].map((x) => x[0]))) console.log("  ", m);
console.log("\n--- context around 'eadline' (up to 8):");
let n = 0;
for (const m of h.matchAll(/eadline/g)) {
  if (n++ >= 8) break;
  console.log("   …" + unesc(h.slice(Math.max(0, m.index - 100), m.index + 100)).replace(/\s+/g, " ") + "…");
}
console.log("\n--- context around 'ddline' done. status words:");
for (const w of ["Open for submissions", "Bounty closed", "Submissions closed", "Judging in progress", "Winners announced", "on hold"]) {
  console.log("   " + (h.includes(w) ? "FOUND   " : "absent  ") + w);
}
