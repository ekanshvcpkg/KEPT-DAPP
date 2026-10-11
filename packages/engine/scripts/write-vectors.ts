// Regenerates test-vectors/oath-vectors.json from SCENARIOS. Run: pnpm --filter @kept/engine vectors
import { writeFileSync } from "node:fs";
import { SCENARIOS, vectorOf } from "../src/vectors";

const out = {
  $meta: {
    about: "KEPT Oath rule vectors (design/rules.md + docs/DECISIONS.md amendments, money model D-93). Amounts are SKR base units (6 decimals) as strings.",
    moneyRule: "Each miss costs missBps/10000 of the ORIGINAL stake (floor), capped at the member's balance. Each missed member's forfeiture is split on its own into k + 1 equal shares (k = that day's keepers, one more for KEPT); each share floors and the dust goes to KEPT. A missed member gets no share. No entry fee. A day with no keepers sends all of its forfeitures to the treasury (owner-confirmed; see nobody-keeps-day and the solo vectors). A broken Oath (HP 0) sends half of every start-of-day balance to the treasury and holds half for the 7-day Rematch window, after which the program sweeps it to the treasury (`held`). `fee` is KEPT's shares including dust; `toTreasury` is money outside the split.",
    generatedBy: "packages/engine/scripts/write-vectors.ts",
    marks: "one string per finished day, one char per member: k = kept, m = missed",
  },
  vectors: SCENARIOS.map(vectorOf),
};
writeFileSync(new URL("../test-vectors/oath-vectors.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${out.vectors.length} vectors`);
