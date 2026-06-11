import type {
  CommandContext,
  CommandHandler,
  CommandResult,
} from "../process-command.ts";
import { HttpError } from "../../lib/http-error.ts";
import { Game } from "../../models/game.ts";
import { GameNode } from "../../models/game-node.ts";
import { GameNodeChallenge } from "../../models/game-node-challenge.ts";
import { GameTeamPosition } from "../../models/game-team-position.ts";
import { GameTilePlacement } from "../../models/game-tile-placement.ts";
import { swapPlacements } from "../tile-swap-service.ts";
import { assertSlotUnlocked } from "../../services/slot-visibility.ts";
import { assertNotHandCompleted } from "../hand-completed-lock.ts";
import { recordCommandGeolocation } from "../../services/geolocation.ts";

interface SwapTilePayload {
  /** `game_tiles.id` of a tile currently in the issuing team's hand. */
  handTileId: string;
  /**
   * `game_tiles.id` of the specific tile at the team's current station to
   * receive in exchange. Required because a station may hold up to
   * `games.slots_per_node` tiles; the caller picks which one to take.
   */
  stationTileId: string;
  /**
   * Phase L: raw geolocation sample. Routed through
   * `recordCommandGeolocation` (warn+allow; malformed values are silently
   * dropped). Held as `unknown` here to avoid double-validating before the
   * shared helper.
   */
  rawGeo: unknown;
}

function parseTileId(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(
      400,
      "invalid_payload",
      `SWAP_TILE requires a string ${fieldName} in the payload`,
    );
  }
  return value;
}

function parsePayload(payload: Record<string, unknown>): SwapTilePayload {
  const handTileId = parseTileId(payload.handTileId, "handTileId");
  const stationTileId = parseTileId(payload.stationTileId, "stationTileId");
  if (handTileId === stationTileId) {
    throw new HttpError(
      400,
      "invalid_payload",
      "handTileId and stationTileId must reference different tiles",
    );
  }
  return { handTileId, stationTileId, rawGeo: payload.geo };
}

/**
 * Exchange one of the team's hand tiles with one of the tiles at the team's
 * checked-in station. Requires the team to be at a station per TDD §3.3
 * `canSwap`. Both tiles are caller-chosen: with `games.slots_per_node > 1`
 * a station may hold multiple tiles and the server cannot disambiguate.
 */
export const swapTileHandler: CommandHandler = {
  async handle(ctx: CommandContext): Promise<CommandResult> {
    const { handTileId, stationTileId, rawGeo } = parsePayload(ctx.payload);

    await assertNotHandCompleted({
      gameTeamId: ctx.gameTeamId,
      transaction: ctx.transaction,
    });

    const position = await GameTeamPosition.findOne({
      where: { gameTeamId: ctx.gameTeamId },
      transaction: ctx.transaction,
    });
    if (!position || position.currentGameNodeId == null) {
      throw new HttpError(
        409,
        "not_checked_in",
        "Team must be checked in at a station to swap tiles",
      );
    }

    const placements = await GameTilePlacement.findAll({
      where: { gameTileId: [handTileId, stationTileId] },
      transaction: ctx.transaction,
    });
    const handPlacement = placements.find(
      (p) => p.gameTileId === handTileId,
    );
    const stationPlacement = placements.find(
      (p) => p.gameTileId === stationTileId,
    );

    if (!handPlacement || handPlacement.gameTeamId !== ctx.gameTeamId) {
      throw new HttpError(
        400,
        "tile_not_in_hand",
        `Tile ${handTileId} is not in this team's hand`,
      );
    }
    if (
      !stationPlacement ||
      stationPlacement.gameNodeId !== position.currentGameNodeId
    ) {
      throw new HttpError(
        400,
        "tile_not_at_station",
        `Tile ${stationTileId} is not at the team's current station`,
      );
    }

    const station = await GameNode.findByPk(position.currentGameNodeId, {
      transaction: ctx.transaction,
    });
    if (!station) {
      throw new HttpError(
        500,
        "internal_error",
        `Station ${position.currentGameNodeId} not found`,
      );
    }

    // Phase L: capture telemetry against the team's current station. The
    // helper silently drops malformed input and may mutate
    // `position.lastKnown_*` columns. We save the position below (already
    // happens conditionally when consuming a swap credit; we OR the geo
    // path in).
    const geoResult = recordCommandGeolocation({
      rawGeo,
      position,
      currentStation: station,
    });

    // Per-slot lock check (TDD §3.3 `canSwapSlot`, formalized in chunk 6
    // via `services/slot-visibility.ts`). The station tile occupies some
    // `slot_index` on the node; the helper consults
    // `games.slot_unlock_offsets_seconds[slot_index]` against wall clock
    // and rejects with `409 slot_locked` when still locked. Independent
    // of whether the `SLOT_UNLOCKED` scheduled job has fired (that job
    // exists for replay/broadcast, not gameplay).
    const stationSlotIndex = stationPlacement.slotIndex;
    if (stationSlotIndex == null) {
      // Belt-and-suspenders: chunk 3's CHECK guarantees this is unreachable
      // for any row with `game_node_id` set, but the type system can't see
      // that, so fail loud rather than silently treating it as slot 0.
      throw new HttpError(
        500,
        "internal_error",
        `Station placement for tile ${stationTileId} is missing slot_index`,
      );
    }
    const game = await Game.findByPk(ctx.gameId, {
      transaction: ctx.transaction,
      attributes: ["id", "startedAt", "slotUnlockOffsetsSeconds"],
    });
    if (!game) {
      throw new HttpError(
        500,
        "internal_error",
        `Game ${ctx.gameId} not found mid-handler`,
      );
    }
    assertSlotUnlocked(
      game,
      stationSlotIndex,
      `Slot ${stationSlotIndex} at ${station.code}`,
    );

    // Phase H: challenge gate. If the station carries any challenges in
    // `game_node_challenges`, the team must have earned a swap credit
    // (CHALLENGE_COMPLETED in the current check-in session) before
    // claiming a tile. Stations with zero configured challenges remain
    // free-swap for backward compatibility with templates that predate
    // the challenge wiring.
    const challengeCount = await GameNodeChallenge.count({
      where: { gameNodeId: station.id },
      transaction: ctx.transaction,
    });
    if (challengeCount > 0 && !position.pendingSwapCredit) {
      throw new HttpError(
        409,
        "swap_credit_required",
        `Team must complete a challenge at ${station.code} before swapping`,
      );
    }

    await swapPlacements(
      ctx.transaction,
      handPlacement.gameTileId,
      stationPlacement.gameTileId,
    );

    // Consume the credit. `credit_earned_in_session` stays true so the
    // team can't earn a second credit within the same check-in (TDD §3.8
    // "one swap per session"). Both flags clear on CHECK_OUT / CHECK_IN.
    if (challengeCount > 0) {
      position.pendingSwapCredit = false;
    }
    // Save the position iff something changed: either credit was consumed
    // (existing path) or the geo helper recorded a sample (Phase L). We
    // skip the save when neither applied to keep the original "free-swap
    // stations don't touch the position row" behaviour.
    if (challengeCount > 0 || geoResult.geo != null) {
      await position.save({ transaction: ctx.transaction });
    }

    const eventPayload: Record<string, unknown> = {
      nodeId: station.id,
      nodeCode: station.code,
      handTileId: handPlacement.gameTileId,
      stationTileId: stationPlacement.gameTileId,
    };
    if (geoResult.geo != null) {
      eventPayload.geo = geoResult.geo;
      eventPayload.geolocationWarning = geoResult.geolocationWarning;
    }

    return {
      events: [
        {
          eventType: "SWAP_TILE",
          payload: eventPayload,
        },
      ],
    };
  },
};
