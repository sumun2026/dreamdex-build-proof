import { readFileSync, writeFileSync } from "node:fs";
const raw = readFileSync(process.argv[2], "utf8");
const d = raw.replace(/\\\\n/g, "\n").replace(/\\\\"/g, '"').replace(/\\"/g, '"').replace(/\\n/g, "\n");
writeFileSync(process.argv[3], d);
const lines = d.split("\n");
const hits = lines.filter((l) =>
  /\$\d|budget|deadline|November|Oct(?:ober)? 19|per (?:accepted|valid)|first[- ]valid|Feedback|cap\b|reproducib/i.test(l)
  && l.length < 400);
console.log("total lines:", lines.length, "| matching:", hits.length);
for (const l of hits.slice(0, 90)) console.log("  " + l.trim());
