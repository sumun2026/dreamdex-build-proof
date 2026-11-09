const B = ["https://api.dreamdex.io/v0", "https://stg.api.dreamdex.io/v0"];
for (const base of B) {
  const cur = await (await fetch(base + "/currencies")).json();
  const mk = await (await fetch(base + "/markets")).json();
  const codes = cur.currencies.map((c) => c.code);
  const ids = mk.markets.map((m) => m.symbol);
  // exactly what dreamdex.ts:377-386 does: id "BASE:QUOTE" -> unified "BASE/QUOTE"
  const unified = ids.map((s) => s.replace(":", "/"));
  console.log(`\n#### ${base}`);
  console.log("  currency codes  :", codes.join(", "));
  console.log("  has 'USDC'      :", codes.includes("USDC"), "  has 'USDC.e':", codes.includes("USDC.e"));
  console.log("  market ids      :", ids.join(", "));
  console.log("  CCXT unified    :", unified.join(", "));
  console.log("  'SOMI/USDC' valid?", unified.includes("SOMI/USDC"));
}
