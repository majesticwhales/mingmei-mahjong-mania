/** Game rule flag key — see `game_rule_flags.rule_key`. */
export const RED_FIVES_RULE_KEY = "red_fives_enabled";

export type NumberedSuit = "man" | "pin" | "sou";

export type TileIdentity = {
  suit: string;
  rank: number;
  copyIndex: number;
};

const NUMBERED_SUITS = new Set<string>(["man", "pin", "sou"]);

/** Catalog convention: copy 0 of each suited 5 is the red-five tile (3 per deck). */
export function isRedFiveTileIdentity(tile: TileIdentity): boolean {
  return (
    NUMBERED_SUITS.has(tile.suit) && tile.rank === 5 && tile.copyIndex === 0
  );
}

/** Whether red-five scoring / UI treatment applies for this game. */
export function isRedFiveForGame(
  tile: TileIdentity,
  redFivesEnabled: boolean,
): boolean {
  return redFivesEnabled && isRedFiveTileIdentity(tile);
}
