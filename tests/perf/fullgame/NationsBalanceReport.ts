/**
 * Compares Nations balance simulations (NationsBalanceSim.ts output): who
 * wins and who survives, by starting country size.
 *
 * Usage: npx tsx tests/perf/fullgame/NationsBalanceReport.ts <dir with .json>
 */
import fs from "fs";
import path from "path";
import type { SimResult } from "./NationsBalanceSim";

const TIERS: { label: string; below: number }[] = [
  { label: "tiny (< 3k tiles)", below: 3_000 },
  { label: "small (3k-8k)", below: 8_000 },
  { label: "medium (8k-20k)", below: 20_000 },
  { label: "large (20k-45k)", below: 45_000 },
  { label: "huge (45k+)", below: Infinity },
];
const CHECKPOINTS = [5, 10, 20];

function tierOf(tiles: number): number {
  return TIERS.findIndex((t) => tiles < t.below);
}

function pct(n: number, d: number): string {
  return d === 0 ? "-" : `${((n / d) * 100).toFixed(0)}%`;
}

const dir = process.argv[2];
if (dir === undefined) throw new Error("usage: NationsBalanceReport <dir>");
const games: SimResult[] = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));

const wins = new Map<string, number>();
const tierWins = TIERS.map(() => 0);
const tierCount = TIERS.map(() => 0);
const tierTop5 = TIERS.map(() => 0);
const tierAlive = CHECKPOINTS.map(() => TIERS.map(() => 0));
const tierSeen = CHECKPOINTS.map(() => TIERS.map(() => 0));

for (const game of games) {
  const byFinal = [...game.countries].sort(
    (a, b) => b.finalTiles - a.finalTiles,
  );
  const top5 = new Set(byFinal.slice(0, 5));
  for (const c of game.countries) {
    const t = tierOf(c.startTiles);
    tierCount[t]++;
    if (top5.has(c)) tierTop5[t]++;
    CHECKPOINTS.forEach((minute, k) => {
      if (game.minutes < minute) return;
      tierSeen[k][t]++;
      if (c.eliminatedAt === null || c.eliminatedAt > minute) {
        tierAlive[k][t]++;
      }
    });
  }
  const winner = game.winner ?? byFinal[0].name;
  wins.set(winner, (wins.get(winner) ?? 0) + 1);
  const w = game.countries.find((c) => c.name === winner);
  if (w !== undefined) tierWins[tierOf(w.startTiles)]++;
}

const minutes = games.map((g) => g.minutes).sort((a, b) => a - b);
console.log(
  `${games.length} games, length ${minutes[0].toFixed(0)}-` +
    `${minutes[minutes.length - 1].toFixed(0)} min ` +
    `(median ${minutes[Math.floor(minutes.length / 2)].toFixed(0)})\n`,
);
console.log("Winners:");
for (const [name, n] of [...wins].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${name}: ${n}`);
}
console.log("\nBy starting size (per country-game):");
console.log(
  [
    "tier".padEnd(20),
    "count".padStart(6),
    "wins".padStart(6),
    "top 5".padStart(7),
    ...CHECKPOINTS.map((m) => `alive@${m}m`.padStart(11)),
  ].join(""),
);
TIERS.forEach((tier, t) => {
  if (tierCount[t] === 0) return;
  console.log(
    [
      tier.label.padEnd(20),
      String(tierCount[t]).padStart(6),
      String(tierWins[t]).padStart(6),
      pct(tierTop5[t], tierCount[t]).padStart(7),
      ...CHECKPOINTS.map((_, k) =>
        pct(tierAlive[k][t], tierSeen[k][t]).padStart(11),
      ),
    ].join(""),
  );
});
