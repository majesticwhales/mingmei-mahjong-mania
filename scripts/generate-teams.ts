import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEVELOPERS = ["Max", "Evelyn", "Edward", "Shubham"] as const;
const NON_DEVELOPERS = ["Mingmei", "Victor", "Ruth", "John"] as const;

type Developer = (typeof DEVELOPERS)[number];
type NonDeveloper = (typeof NON_DEVELOPERS)[number];

interface Team {
  team: number;
  developer: Developer;
  nonDeveloper: NonDeveloper;
}

const FORBIDDEN_PAIRS: Partial<Record<Developer, readonly NonDeveloper[]>> = {};

const RUN_COUNT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "run-count.json",
);

interface RunCountState {
  count: number;
}

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isForbiddenPair(developer: Developer, nonDeveloper: NonDeveloper): boolean {
  return FORBIDDEN_PAIRS[developer]?.includes(nonDeveloper) ?? false;
}

function buildTeams(developers: Developer[], nonDevelopers: NonDeveloper[]): Team[] {
  return developers.map((developer, index) => ({
    team: index + 1,
    developer,
    nonDeveloper: nonDevelopers[index]!,
  }));
}

function hasForbiddenPair(teams: Team[]): boolean {
  return teams.some(({ developer, nonDeveloper }) =>
    isForbiddenPair(developer, nonDeveloper),
  );
}

export function generateTeams(): Team[] {
  let teams: Team[];
  do {
    teams = buildTeams(shuffle(DEVELOPERS), shuffle(NON_DEVELOPERS));
  } while (hasForbiddenPair(teams));
  return teams;
}

function readRunCount(): number {
  if (!existsSync(RUN_COUNT_PATH)) {
    return 0;
  }

  const state = JSON.parse(
    readFileSync(RUN_COUNT_PATH, "utf8"),
  ) as RunCountState;

  return state.count;
}

function writeRunCount(count: number): void {
  const state: RunCountState = { count };
  writeFileSync(RUN_COUNT_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function incrementRunCount(): number {
  const next = readRunCount() + 1;
  writeRunCount(next);
  return next;
}

function parseArgs(argv: string[]): { dryRun: boolean } {
  return {
    dryRun: argv.includes("--dry-run") || argv.includes("-n"),
  };
}

function printRules(): void {
  console.log("Rules:");
  console.log("- 4 teams of 2");
  console.log("- Each team: 1 developer + 1 non-developer");
  console.log(`- Developers: ${DEVELOPERS.join(", ")}`);
  console.log(`- Non-developers: ${NON_DEVELOPERS.join(", ")}`);
  const forbiddenPairs = Object.entries(FORBIDDEN_PAIRS).flatMap(([dev, nonDevs]) =>
    nonDevs.map((nonDev) => `${dev} + ${nonDev}`),
  );
  console.log(
    `- Forbidden pairs: ${forbiddenPairs.length > 0 ? forbiddenPairs.join(", ") : "none"}`,
  );
}

function printTeams(teams: Team[], dryRun: boolean, runCount: number): void {
  if (dryRun) {
    console.log("DRY RUN — preview only, no teams saved.");
    printRules();
    console.log("\nPreview teams:\n");
  } else {
    console.log("Generated teams (1 developer + 1 non-developer each):\n");
  }

  for (const { team, developer, nonDeveloper } of teams) {
    console.log(`Team ${team}: ${developer} + ${nonDeveloper}`);
  }

  console.log(`\nRun count: ${runCount}`);

  if (dryRun) {
    console.log("Dry run complete — count unchanged.");
  }
}

const { dryRun } = parseArgs(process.argv.slice(2));
const runCount = dryRun ? readRunCount() : incrementRunCount();
printTeams(generateTeams(), dryRun, runCount);
