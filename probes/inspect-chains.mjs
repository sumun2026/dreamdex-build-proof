import * as c from "@somnia-chain/markets-sdk/chains";

const URLRE = /(https?:\/\/|wss?:\/\/)[^"'\\\s]+/g;

for (const name of ["somniaMainnet", "somniaShannon", "hidekiTestnet", "somniaElwood", "somniaLocal"]) {
  const ch = c[name];
  if (!ch) {
    console.log(`#### ${name} = absent from SDK`);
    continue;
  }
  const s = JSON.stringify(ch, (k, v) => (typeof v === "bigint" ? String(v) : v)) ?? "";
  const urls = [...new Set(s.match(URLRE) || [])];
  console.log(`\n#### ${name}  id=${ch.id}  name=${ch.name}`);
  console.log("   top-level keys:", Object.keys(ch).join(", "));
  urls.slice(0, 12).forEach((u) => console.log("   URL:", u));
}

console.log("\nChainId enum:", JSON.stringify(c.ChainId));
console.log("somniaChains:", (c.somniaChains || []).map((x) => `${x.name}/${x.id}`).join(", "));
