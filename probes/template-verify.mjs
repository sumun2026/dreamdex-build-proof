// READ-ONLY template verifier for the feedback reports (no writes, line-ending safe).
// The bounty template asks per item: Title, Severity, Area, Steps to reproduce, Expected, Actual,
// Evidence, Environment (SDK version / network / wallet address).
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
const DIR = process.argv[2] ?? "D:/imag/bug-reports/2026-11-07-dreamdex-perps-api-docs";
const REQUIRED = ["Severity:", "Area:", "## Summary", "## Steps to reproduce", "## Expected", "## Actual", "## Evidence", "## Environment"];
// The bounty page shows the field as an enum, so one value only.
const SEV_ENUM = ["critical", "major", "normal"];
const AREA_ENUM = ["API", "SDK", "docs", "app", "contracts"];
let bad = 0;
for (const f of readdirSync(`${DIR}/feedback`).filter((x) => x.endsWith(".md")).sort()) {
  const t = readFileSync(`${DIR}/feedback/${f}`, "utf8").replace(/\r\n/g, "\n");
  const miss = REQUIRED.filter((r) => !t.includes(r));
  const env = t.split("\n## Environment\n")[1]?.split("\n## ")[0] ?? "";
  const asks = {
    sdk: /sdk/i.test(env),
    network: /mainnet|testnet|chain|shannon|5031/i.test(env),
    wallet: /wallet address/i.test(env),
  };
  const sev = (t.match(/^Severity:\s*(\w+)/m) ?? [])[1] ?? "?";
  const area = (t.match(/^Area:\s*(.+)$/m) ?? [])[1]?.trim() ?? "?";
  const sevOk = SEV_ENUM.includes(sev);
  const areaOk = AREA_ENUM.includes(area);
  // every cited probes/ path must exist
  const refs = [...new Set([...t.matchAll(/probes\/[A-Za-z0-9._\-]+/g)].map((m) => m[0]))];
  const dangling = refs.filter((r) => !existsSync(join(DIR, r)));
  const ok = !miss.length && asks.sdk && asks.network && asks.wallet && !dangling.length && t.startsWith("# ") && sevOk && areaOk;
  if (!ok) bad++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${f}  sev=${sev}  area=${area}  envBullets=${env.split("\n").filter((l) => l.startsWith("- ")).length}` +
      `  refs=${refs.length}${dangling.length ? ` DANGLING:${dangling.join(",")}` : ""}` +
      `${miss.length ? ` MISSING:${miss.join("|")}` : ""}${!asks.wallet ? " NO-WALLET-ASK" : ""}` +
      `${!sevOk ? " BAD-SEVERITY" : ""}${!areaOk ? " BAD-AREA" : ""}`,
  );
}
const sevs = readdirSync(`${DIR}/feedback`).filter((x) => x.endsWith(".md"))
  .map((f) => (readFileSync(`${DIR}/feedback/${f}`, "utf8").match(/^Severity:\s*(\w+)/m) ?? [])[1]);
const count = (s) => sevs.filter((x) => x === s).length;
const majors = count("major"), crit = count("critical"), rest = sevs.length - majors - crit;
console.log(`\nitems=${sevs.length}  critical=${crit} major=${majors} other=${rest}  ->  $${crit * 40 + majors * 40 + rest * 15} if all accepted (cap $1,500)`);
console.log(bad ? `${bad} item(s) FAIL the template` : "all items pass the template");
