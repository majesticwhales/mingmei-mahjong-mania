import { useMemo } from "react";
import { TILE_BACK_IMAGE_PATH } from "../data/riichiTiles";
import { isTileStation, TILES_PER_STATION } from "../data/tileStations";
import type { SubwayLine } from "../data/types";
import { tileImagePath } from "../lib/tileImages";
import { useAtStation } from "../state/game/hooks";
import { useNodeView } from "../state/game/useNodeView";
import type {
  AvailableActionDto,
  AvailableActionReason,
  AvailableActionType,
  NodeViewTileDto,
} from "../wire/nodeView";
import type { HandTileDto } from "../wire/projection";
import { ChallengeCooldownCountdown } from "./ChallengeCooldownCountdown";

interface Props {
  /**
   * The node whose details fill the panel. `null` collapses the panel
   * to its empty / closed state. The owner (`<GameScreen />`) is
   * responsible for picking which node: tap-selected on the map,
   * pending check-in target, or fallback to the team's currently
   * checked-in station.
   */
  viewingNodeId: string | null;
  /**
   * Display name of the team's currently-checked-in station, used by
   * the "Checked in at …" eyebrow when the user is browsing a
   * different station. `null` when not checked in anywhere.
   */
  checkedInNodeName: string | null;
  stationLines?: SubwayLine[];
  handTiles: HandTileDto[];
  commandsPending?: boolean;
  checkInPending?: boolean;
  commandsDisabled?: boolean;
  onClose: () => void;
  onCheckIn: (nodeId: string) => void;
  onCheckOut: () => void;
  onSwapTile: () => void;
  onOpenChallenge?: () => void;
  onClaimWin?: () => void;
}

/**
 * Phase L Chunk 5 — `StationPanel` is now a thin renderer over
 * [`useNodeView(viewingNodeId)`](../state/game/useNodeView.ts). Every
 * tile slot, the eyebrow line, and the action-button enable/disable +
 * tooltip text flow from the server's `NodeViewDto`. The projection's
 * `atStation` pointer is still consulted (via `useAtStation()`) to
 * decide *which* eyebrow variant to show ("At …" vs "Checked in at
 * …") and to gate UI that's specific to the team's current station
 * (the swap / challenge / claim cluster). Action availability is no
 * longer re-derived from raw projection fields — that work moved to
 * `server/src/services/node-view.ts` (TDD §3.14).
 */
function reasonCopy(reason: AvailableActionReason | undefined): string | null {
  if (!reason) return null;
  switch (reason) {
    case "not_checked_in":
      return "Check in here first.";
    case "wrong_node":
      return "Move to this station first.";
    case "slot_locked":
      return "No unlocked tiles available here yet.";
    case "hand_completed":
      return "Your hand is already complete.";
    case "swap_credit_required":
      return "Complete this station's challenge to earn a swap credit.";
    case "credit_already_used":
      return "Swap credit already spent at this station.";
    case "challenge_in_progress":
      return "A challenge is already in progress.";
    case "challenge_on_cooldown":
      return "Challenge is on cooldown.";
    case "no_challenge_at_station":
      return "No challenge available at this station.";
    case "no_winning_wait":
      return "No tile here completes your hand.";
    case "not_tenpai":
      return "Your hand isn't ready to claim yet.";
    case "game_ended":
      return "Game has ended.";
    default: {
      // Exhaustiveness guard — adding a new reason on the server
      // without a copy entry here is a build-time error.
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

function emptyAction(action: AvailableActionType): AvailableActionDto {
  return { action, enabled: false, reason: "game_ended" };
}

function actionMap(
  actions: ReadonlyArray<AvailableActionDto> | undefined,
): Record<AvailableActionType, AvailableActionDto> {
  // Default every action to disabled-with-game_ended so a missing /
  // pre-load nodeView surface (loading, error, null) still renders a
  // consistent button matrix. The server is the source of truth once
  // the view lands.
  const map: Record<AvailableActionType, AvailableActionDto> = {
    check_in: emptyAction("check_in"),
    check_out: emptyAction("check_out"),
    swap_tile: emptyAction("swap_tile"),
    swap_location_tiles: emptyAction("swap_location_tiles"),
    start_challenge: emptyAction("start_challenge"),
    claim_win: emptyAction("claim_win"),
  };
  if (!actions) return map;
  for (const entry of actions) map[entry.action] = entry;
  return map;
}

function renderTripleStationSlots(tiles: NodeViewTileDto[] | undefined) {
  const bySlot = new Map<number, NodeViewTileDto>();
  if (tiles) {
    for (const entry of tiles) bySlot.set(entry.slotIndex, entry);
  }
  return Array.from({ length: TILES_PER_STATION }, (_, slotIndex) => {
    const entry = bySlot.get(slotIndex);
    const tile = entry?.tile ?? null;
    if (tile) {
      return (
        <div key={slotIndex} className="station-panel__slot">
          <span className="station-panel__slot-label">Slot {slotIndex + 1}</span>
          <img
            src={tileImagePath(tile)}
            alt={tile.displayName}
            className="station-panel__tile-image station-panel__tile-image--station-slot"
          />
          <p className="station-panel__tile-name">{tile.displayName}</p>
        </div>
      );
    }
    return (
      <div key={slotIndex} className="station-panel__slot station-panel__slot--unknown">
        <span className="station-panel__slot-label">Slot {slotIndex + 1}</span>
        <img
          src={TILE_BACK_IMAGE_PATH}
          alt=""
          className="station-panel__tile-image station-panel__tile-image--station-slot station-panel__tile-image--hidden"
        />
        <p className="station-panel__tile-name">Unknown</p>
      </div>
    );
  });
}

function renderLegacyStationTiles(tiles: NodeViewTileDto[] | undefined) {
  if (!tiles?.length) return null;
  const visibleEntries = tiles.filter((entry) => entry.tile != null);
  if (visibleEntries.length === 0) return null;
  return visibleEntries.map((entry) => (
    <div key={entry.slotIndex} className="station-panel__slot">
      <span className="station-panel__slot-label">Slot {entry.slotIndex + 1}</span>
      <img
        src={tileImagePath(entry.tile!)}
        alt={entry.tile!.displayName}
        className="station-panel__tile-image station-panel__tile-image--large"
      />
      <p className="station-panel__tile-name">{entry.tile!.displayName}</p>
    </div>
  ));
}

export function StationPanel({
  viewingNodeId,
  checkedInNodeName,
  stationLines = [],
  handTiles,
  commandsPending = false,
  checkInPending = false,
  commandsDisabled = false,
  onClose,
  onCheckIn,
  onCheckOut,
  onSwapTile,
  onOpenChallenge,
  onClaimWin,
}: Props) {
  const { data: nodeView } = useNodeView(viewingNodeId);
  const atStation = useAtStation();

  const isOpen = viewingNodeId != null;
  const checkedInId = atStation?.nodeId ?? null;
  const isViewingCheckedInStation =
    viewingNodeId != null && checkedInId != null && viewingNodeId === checkedInId;
  const isBrowsingElsewhere =
    viewingNodeId != null && checkedInId != null && viewingNodeId !== checkedInId;

  const actions = useMemo(
    () => actionMap(nodeView?.availableActions),
    [nodeView?.availableActions],
  );
  // Challenge gate = server-driven "swap blocked on a missing credit".
  // The pre-Phase-H-seeded client scaffold + its override prop are
  // gone now that every tile station carries a real `currentChallenge`
  // from `buildCurrentChallenge`.
  const swapGateActive = actions.swap_tile.reason === "swap_credit_required";
  const showChallenge = isViewingCheckedInStation && swapGateActive;
  const showSwapTile = isViewingCheckedInStation && !showChallenge;
  const showClaimWin = isViewingCheckedInStation && actions.claim_win.enabled;
  const showCheckIn = viewingNodeId != null && !isViewingCheckedInStation;

  const checkInDisabledReason = reasonCopy(actions.check_in.reason);
  const swapDisabledReason = reasonCopy(actions.swap_tile.reason);
  const challengeDisabledReason = reasonCopy(actions.start_challenge.reason);
  const claimDisabledReason = reasonCopy(actions.claim_win.reason);

  const challengeCooldownUntil =
    nodeView?.currentChallenge?.status === "cooldown"
      ? nodeView.currentChallenge.cooldownUntil
      : undefined;
  // While the team has a challenge in flight at this station, the
  // server reports `start_challenge.enabled === false` with reason
  // `challenge_in_progress`. Locally we still want the button to be
  // clickable so the player can re-open the modal after closing it via
  // the X. Clicking is a no-op for the engine: GameScreen's auto-start
  // effect only fires START_CHALLENGE when
  // `currentChallenge.status === "available"`.
  const challengeInProgress =
    nodeView?.currentChallenge?.status === "in_progress";
  const challengeButtonEnabled =
    challengeInProgress || actions.start_challenge.enabled;

  const actionsDisabledBase = commandsPending || commandsDisabled || checkInPending;

  const stationCode = nodeView?.code ?? null;
  const stationName = nodeView?.name ?? null;
  const isTripleStation = Boolean(stationCode && isTileStation(stationCode));
  const stationTiles = nodeView
    ? isTripleStation
      ? renderTripleStationSlots(nodeView.tiles)
      : renderLegacyStationTiles(nodeView.tiles)
    : null;

  return (
    <aside
      className={`station-panel${isOpen ? " station-panel--open" : ""}`}
      aria-hidden={!isOpen}
      aria-label="Station details"
    >
      <div className="station-panel__handle" aria-hidden="true" />
      <header className="station-panel__header">
        <div>
          <p className="station-panel__eyebrow">
            {isViewingCheckedInStation
              ? `At: ${stationCode ?? atStation!.code}`
              : isBrowsingElsewhere
                ? `Checked in at ${checkedInNodeName ?? atStation!.code}`
                : "Station"}
          </p>
          <h2 className="station-panel__title">
            {stationName ?? "Pick a station"}
          </h2>
        </div>
        {isOpen && (
          <button type="button" className="station-panel__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        )}
      </header>
      <div className="station-panel__body">
        {!nodeView && (
          <p className="station-panel__empty">
            Tap any station on the map to check in or inspect tiles along your route.
          </p>
        )}
        {stationLines.length > 0 && (
          <section>
            <h3 className="station-panel__section-title">Lines</h3>
            <ul className="station-panel__lines">
              {stationLines.map((line) => (
                <li key={line.id} className="station-panel__line">
                  <span className="station-panel__swatch" style={{ background: line.color }} aria-hidden="true" />
                  <span>{line.name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {nodeView && stationTiles && (
          <section>
            <h3 className="station-panel__section-title">Station tiles</h3>
            <div
              className={`station-panel__slots${isTripleStation ? " station-panel__slots--triple" : ""
                }`}
            >
              {stationTiles}
            </div>
          </section>
        )}
        {showCheckIn && (
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={actionsDisabledBase || !actions.check_in.enabled}
            title={!actions.check_in.enabled ? checkInDisabledReason ?? undefined : undefined}
            onClick={() => onCheckIn(viewingNodeId!)}
          >
            {checkInPending
              ? "Checking in…"
              : isBrowsingElsewhere
                ? "Move here"
                : "Check in here"}
          </button>
        )}
        {isViewingCheckedInStation && (
          <div className="station-panel__actions">
            {showChallenge && onOpenChallenge && (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={actionsDisabledBase || !challengeButtonEnabled}
                title={!challengeButtonEnabled ? challengeDisabledReason ?? undefined : undefined}
                onClick={onOpenChallenge}
              >
                View challenge
              </button>
            )}
            {showSwapTile && (
              <button
                type="button"
                className="btn btn--secondary"
                disabled={actionsDisabledBase || !actions.swap_tile.enabled}
                title={!actions.swap_tile.enabled ? swapDisabledReason ?? undefined : undefined}
                onClick={onSwapTile}
              >
                Swap tile
              </button>
            )}
            {challengeCooldownUntil && (
              <ChallengeCooldownCountdown cooldownUntil={challengeCooldownUntil} />
            )}
            {showClaimWin && onClaimWin && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={actionsDisabledBase || !actions.claim_win.enabled}
                title={!actions.claim_win.enabled ? claimDisabledReason ?? undefined : undefined}
                onClick={onClaimWin}
              >
                Claim hand
              </button>
            )}
            <button
              type="button"
              className="btn btn--danger"
              disabled={actionsDisabledBase || !actions.check_out.enabled}
              onClick={onCheckOut}
            >
              Check out
            </button>
          </div>
        )}
        {isBrowsingElsewhere && (
          <button
            type="button"
            className="btn btn--ghost btn--block"
            // "Check out from <other station>" is a command against
            // the team's checked-in node, not the viewed one, so the
            // viewed node's `availableActions.check_out` (which would
            // report `wrong_node`) is intentionally ignored here.
            disabled={actionsDisabledBase}
            onClick={onCheckOut}
          >
            Check out from {checkedInNodeName ?? atStation!.code}
          </button>
        )}
        <section>
          <h3 className="station-panel__section-title">Your hand ({handTiles.length})</h3>
          <ul className="station-panel__tile-grid">
            {handTiles.map((tile) => (
              <li className="station-panel__tile" key={tile.instanceId}>
                <img
                  src={tileImagePath(tile)}
                  alt={tile.displayName}
                  title={tile.displayName}
                  className="station-panel__tile-image"
                />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
