import { randomUUID } from "node:crypto";
import { Op } from "sequelize";
import { Challenge } from "../../src/models/challenge.ts";
import { ChallengeDeck } from "../../src/models/challenge-deck.ts";
import { ChallengeType } from "../../src/models/challenge-type.ts";
import { GameNodeChallenge } from "../../src/models/game-node-challenge.ts";
import { MapTemplateNodeChallenge } from "../../src/models/map-template-node-challenge.ts";

const TEST_DECK_CODE_PREFIX = "test-deck-";
const TEST_CARD_CODE_PREFIX = "test-card-";

export interface SeededTestChallenge {
  deckId: string;
  challengeId: string;
  gameNodeChallengeId: string;
}

/**
 * Seed one `ChallengeDeck` + `Challenge` + `GameNodeChallenge` row so an
 * engine test can exercise the honor-system flow without touching map
 * templates. Catalog rows (`challenge_decks` and `challenges`) are NOT
 * truncated by `truncateMutableTables`; call `clearTestChallenges`
 * in `afterEach` to keep the catalog clean.
 *
 * Codes are randomized so concurrent tests (and stale rows from prior
 * aborted runs) cannot collide on the unique-code constraints.
 */
export async function attachChallengeToGameNode(args: {
  gameNodeId: string;
  sortOrder?: number;
  title?: string;
  description?: string;
  flavorText?: string | null;
  imageUrl?: string | null;
}): Promise<SeededTestChallenge> {
  const challengeType = await ChallengeType.findOne();
  if (!challengeType) {
    throw new Error(
      "attachChallengeToGameNode: at least one challenge_type must be seeded",
    );
  }
  const suffix = randomUUID();
  const deck = await ChallengeDeck.create({
    code: `${TEST_DECK_CODE_PREFIX}${suffix}`,
    name: "Test deck",
    isActive: true,
    sortOrder: 0,
  });
  const challenge = await Challenge.create({
    challengeDeckId: deck.id,
    challengeTypeId: challengeType.id,
    code: `${TEST_CARD_CODE_PREFIX}${suffix}`,
    title: args.title ?? "Test challenge",
    description: args.description ?? "Do the thing.",
    flavorText: args.flavorText ?? null,
    imageUrl: args.imageUrl ?? null,
    parameters: {},
    sortOrder: 0,
    isActive: true,
  });
  const gameNodeChallenge = await GameNodeChallenge.create({
    gameNodeId: args.gameNodeId,
    challengeId: challenge.id,
    sortOrder: args.sortOrder ?? 0,
  });
  return {
    deckId: deck.id,
    challengeId: challenge.id,
    gameNodeChallengeId: gameNodeChallenge.id,
  };
}

/**
 * Tear down every test-seeded `Challenge` + `ChallengeDeck`. The
 * `challenges.code` and `challenge_decks.code` LIKE pattern matches
 * everything created via `attachChallengeToGameNode`. Safe to call when
 * the catalog is empty.
 *
 * Deletion order: any `map_template_node_challenges` rows referencing
 * the test challenges first (ON DELETE RESTRICT), then deck-cascaded
 * challenges. Mutable join rows (`game_node_challenges` /
 * `game_challenge_instances`) are wiped by `truncateMutableTables`
 * separately.
 */
export async function clearTestChallenges(): Promise<void> {
  const challenges = await Challenge.findAll({
    where: { code: { [Op.like]: `${TEST_CARD_CODE_PREFIX}%` } },
    attributes: ["id"],
  });
  if (challenges.length > 0) {
    await MapTemplateNodeChallenge.destroy({
      where: { challengeId: challenges.map((c) => c.id) },
    });
  }
  // ChallengeDeck.destroy + ON DELETE CASCADE wipes the challenges too.
  await ChallengeDeck.destroy({
    where: { code: { [Op.like]: `${TEST_DECK_CODE_PREFIX}%` } },
  });
}
