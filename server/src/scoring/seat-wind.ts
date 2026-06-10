/**
 * Map a `team_definitions.code` to the scoring module's wind rank.
 *
 * The canonical seed assigns `east / south / west / north` to the four
 * team definitions, lining up with `WIND_EAST..WIND_NORTH` (1..4). Lifted
 * out of `projections/game-state.ts` so the CLAIM_WIN handler (Phase J,
 * TDD §3.10) can derive the seat wind without pulling in projection
 * imports.
 *
 * Returns `null` on an unrecognised / missing code so callers can surface
 * a clear error rather than silently scoring on the wrong seat.
 */

import type { WindRank } from "./index.ts";

export function teamCodeToWindRank(
  code: string | undefined | null,
): WindRank | null {
  switch (code) {
    case "east":
      return 1;
    case "south":
      return 2;
    case "west":
      return 3;
    case "north":
      return 4;
    default:
      return null;
  }
}
