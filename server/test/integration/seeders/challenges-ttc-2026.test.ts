import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Op } from "sequelize";
import { Challenge } from "../../../src/models/challenge.ts";
import { ChallengeDeck } from "../../../src/models/challenge-deck.ts";
import { MapTemplateNodeChallenge } from "../../../src/models/map-template-node-challenge.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

// CommonJS seeder; `createRequire` is the supported ESM ↔ CJS bridge
// because the rest of the suite runs as ESM under tsx. The default JSON
// path inside the seeder points at the real authoring file under
// `server/seeders/data/challenges/ttc-2026.json` — tests always pass an
// explicit `jsonPath` so the catalog stays predictable.
const requireCjs = createRequire(import.meta.url);
const seederModule = requireCjs(
  "../../../seeders/20260612000000-seed-challenges-ttc-2026.cjs",
) as {
  seedChallengesFromJson: (
    qi: unknown,
    jsonPath: string,
  ) => Promise<{
    deckId: string;
    challengeCount: number;
    bindingCount: number;
    skippedNodes: string[];
  }>;
};
const { seedChallengesFromJson } = seederModule;

const TEST_DECK_CODE = "test-seeder-deck";

const BASE_CONTENT = {
  deck: {
    code: TEST_DECK_CODE,
    name: "Seeder test deck",
    description: "Used by challenges-ttc-2026.test.ts",
  },
  templateName: "TTC 2026",
  stations: {
    bay: [
      {
        code: "test-seeder-bay-meet",
        type: "task",
        title: "Bay test challenge",
        description: "Find the red scarf.",
        flavorText: "Bay gossip hub.",
        imageUrl: "/challenges/bay.png",
      },
    ],
    union: [
      {
        code: "test-seeder-union",
        type: "task",
        title: "Union test challenge",
        description: "Find the great hall.",
        flavorText: null,
        imageUrl: null,
      },
    ],
  },
} as const;

let tmpDir: string;
let jsonPath: string;

function writeJson(content: unknown): string {
  writeFileSync(jsonPath, JSON.stringify(content, null, 2), "utf-8");
  return jsonPath;
}

async function clearTestDeck(): Promise<void> {
  const decks = await ChallengeDeck.findAll({
    where: { code: TEST_DECK_CODE },
    attributes: ["id"],
  });
  if (decks.length === 0) return;
  const challenges = await Challenge.findAll({
    where: { challengeDeckId: decks.map((d) => d.id) },
    attributes: ["id"],
  });
  if (challenges.length > 0) {
    await MapTemplateNodeChallenge.destroy({
      where: { challengeId: challenges.map((c) => c.id) },
    });
  }
  await ChallengeDeck.destroy({ where: { code: TEST_DECK_CODE } });
}

describe("seedChallengesFromJson (ttc-2026)", () => {
  beforeEach(async () => {
    const sequelize = await getSequelize();
    await truncateMutableTables(sequelize);
    await clearTestDeck();
    tmpDir = mkdtempSync(join(tmpdir(), "seeder-challenges-"));
    jsonPath = join(tmpDir, "challenges.json");
  });

  afterEach(async () => {
    const sequelize = await getSequelize();
    await truncateMutableTables(sequelize);
    await clearTestDeck();
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("inserts the deck + challenges + bindings on first run, then is a no-op on re-run", async () => {
    const sequelize = await getSequelize();
    const qi = sequelize.getQueryInterface();
    writeJson(BASE_CONTENT);

    const first = await seedChallengesFromJson(qi, jsonPath);
    expect(first.challengeCount).toBe(2);
    expect(first.bindingCount).toBe(2);
    expect(first.skippedNodes).toEqual([]);
    expect(typeof first.deckId).toBe("string");

    const challengesAfterFirst = await Challenge.findAll({
      where: { code: { [Op.like]: "test-seeder-%" } },
    });
    const bindingsAfterFirst = await MapTemplateNodeChallenge.findAll({
      where: { challengeId: challengesAfterFirst.map((c) => c.id) },
    });
    expect(challengesAfterFirst).toHaveLength(2);
    expect(bindingsAfterFirst).toHaveLength(2);

    const second = await seedChallengesFromJson(qi, jsonPath);
    expect(second.deckId).toBe(first.deckId);
    expect(second.challengeCount).toBe(2);
    expect(second.bindingCount).toBe(2);

    const challengesAfterSecond = await Challenge.findAll({
      where: { code: { [Op.like]: "test-seeder-%" } },
    });
    const bindingsAfterSecond = await MapTemplateNodeChallenge.findAll({
      where: { challengeId: challengesAfterSecond.map((c) => c.id) },
    });
    expect(challengesAfterSecond).toHaveLength(2);
    expect(bindingsAfterSecond).toHaveLength(2);

    // Re-run preserves the same row ids — proves it's an UPDATE path,
    // not a destroy-and-recreate.
    const idsAfterFirst = new Set(challengesAfterFirst.map((c) => c.id));
    for (const row of challengesAfterSecond) {
      expect(idsAfterFirst.has(row.id)).toBe(true);
    }
  });

  it("round-trips title / description / flavorText / imageUrl into the challenges row", async () => {
    const sequelize = await getSequelize();
    const qi = sequelize.getQueryInterface();
    writeJson(BASE_CONTENT);

    await seedChallengesFromJson(qi, jsonPath);

    const bay = await Challenge.findOne({
      where: { code: "test-seeder-bay-meet" },
    });
    expect(bay).not.toBeNull();
    expect(bay!.title).toBe("Bay test challenge");
    expect(bay!.description).toBe("Find the red scarf.");
    expect(bay!.flavorText).toBe("Bay gossip hub.");
    expect(bay!.imageUrl).toBe("/challenges/bay.png");

    const union = await Challenge.findOne({
      where: { code: "test-seeder-union" },
    });
    expect(union).not.toBeNull();
    expect(union!.flavorText).toBeNull();
    expect(union!.imageUrl).toBeNull();
  });

  it("propagates JSON edits to title / description / imageUrl on re-run", async () => {
    const sequelize = await getSequelize();
    const qi = sequelize.getQueryInterface();

    writeJson(BASE_CONTENT);
    await seedChallengesFromJson(qi, jsonPath);

    const beforeEdit = await Challenge.findOne({
      where: { code: "test-seeder-bay-meet" },
    });
    const originalId = beforeEdit!.id;

    writeJson({
      ...BASE_CONTENT,
      stations: {
        ...BASE_CONTENT.stations,
        bay: [
          {
            ...BASE_CONTENT.stations.bay[0],
            title: "Bay updated title",
            description: "New prompt body.",
            imageUrl: "/challenges/bay-v2.png",
          },
        ],
      },
    });
    await seedChallengesFromJson(qi, jsonPath);

    const afterEdit = await Challenge.findOne({
      where: { code: "test-seeder-bay-meet" },
    });
    expect(afterEdit!.id).toBe(originalId);
    expect(afterEdit!.title).toBe("Bay updated title");
    expect(afterEdit!.description).toBe("New prompt body.");
    expect(afterEdit!.imageUrl).toBe("/challenges/bay-v2.png");
  });

  it("re-points a binding when the slot's challenge_code changes on re-run", async () => {
    const sequelize = await getSequelize();
    const qi = sequelize.getQueryInterface();

    writeJson(BASE_CONTENT);
    await seedChallengesFromJson(qi, jsonPath);

    const originalChallenge = await Challenge.findOne({
      where: { code: "test-seeder-bay-meet" },
    });
    expect(originalChallenge).not.toBeNull();
    const originalBinding = await MapTemplateNodeChallenge.findOne({
      where: { challengeId: originalChallenge!.id, sortOrder: 0 },
    });
    expect(originalBinding).not.toBeNull();
    const originalBindingId = originalBinding!.id;
    const originalChallengeId = originalBinding!.challengeId;

    writeJson({
      ...BASE_CONTENT,
      stations: {
        ...BASE_CONTENT.stations,
        bay: [
          {
            code: "test-seeder-bay-replacement",
            type: "task",
            title: "Bay replacement",
            description: "Different prompt.",
            flavorText: null,
            imageUrl: null,
          },
        ],
      },
    });
    await seedChallengesFromJson(qi, jsonPath);

    const replacedBinding = await MapTemplateNodeChallenge.findOne({
      where: { id: originalBindingId },
    });
    expect(replacedBinding).not.toBeNull();
    expect(replacedBinding!.challengeId).not.toBe(originalChallengeId);

    const replacementChallenge = await Challenge.findOne({
      where: { code: "test-seeder-bay-replacement" },
    });
    expect(replacementChallenge).not.toBeNull();
    expect(replacedBinding!.challengeId).toBe(replacementChallenge!.id);
  });

  it("logs a warning + skips when a station's nodeCode does not exist in the template", async () => {
    const sequelize = await getSequelize();
    const qi = sequelize.getQueryInterface();

    writeJson({
      ...BASE_CONTENT,
      stations: {
        bay: BASE_CONTENT.stations.bay,
        "made-up-station": [
          {
            code: "test-seeder-orphan",
            type: "task",
            title: "Orphan",
            description: "Should not be bound.",
            flavorText: null,
            imageUrl: null,
          },
        ],
      },
    });

    const result = await seedChallengesFromJson(qi, jsonPath);
    expect(result.skippedNodes).toEqual(["made-up-station"]);

    // The bay binding still lands.
    expect(result.bindingCount).toBe(1);
    expect(result.challengeCount).toBe(1);

    // The orphan challenge row itself is not created (the seeder breaks
    // out of the per-station loop before touching `challenges`).
    const orphan = await Challenge.findOne({
      where: { code: "test-seeder-orphan" },
    });
    expect(orphan).toBeNull();
  });

  it("rejects entries that resolve to an unknown challenge_types.code", async () => {
    const sequelize = await getSequelize();
    const qi = sequelize.getQueryInterface();
    writeJson({
      ...BASE_CONTENT,
      stations: {
        bay: [
          {
            code: "test-seeder-bad-type",
            type: "not-a-real-type",
            title: "Bad type",
            description: "Should error.",
            flavorText: null,
            imageUrl: null,
          },
        ],
      },
    });
    await expect(seedChallengesFromJson(qi, jsonPath)).rejects.toThrow(
      /unknown challenge_types\.code='not-a-real-type'/,
    );
  });
});
