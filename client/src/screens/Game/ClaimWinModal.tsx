import { useMemo, useState } from "react";
import { tileImagePath } from "../../lib/tileImages";
import type {
  AnalyzedWaitDto,
  AtStationDto,
  SlotTileDto,
  TileDto,
} from "../../wire/projection";

interface Props {
  atStation: AtStationDto;
  waits: ReadonlyArray<AnalyzedWaitDto>;
  onConfirm: (stationTileId: string) => void;
  onClose: () => void;
  pending?: boolean;
}

interface ClaimableTile {
  slotIndex: number;
  tile: TileDto;
  wait: AnalyzedWaitDto;
}

function resolveStationSlots(atStation: AtStationDto): SlotTileDto[] {
  if (atStation.tiles?.length) return atStation.tiles;
  if (atStation.tile) return [{ slotIndex: 0, tile: atStation.tile }];
  return [];
}

/**
 * Phase J — pick the station tile to claim as the winning 14th. We
 * filter the station's exposed slots to only those whose tile matches
 * a wait by `(suit, rank, copyIndex)`. The orchestrator already picked
 * its preferred copyIndex per wait (red-five-first when red fives are
 * on), so the cross-reference yields the *exact* tile the team should
 * claim to score best — no client-side disambiguation required.
 */
function selectClaimableTiles(
  slots: ReadonlyArray<SlotTileDto>,
  waits: ReadonlyArray<AnalyzedWaitDto>,
): ClaimableTile[] {
  const matches: ClaimableTile[] = [];
  for (const slot of slots) {
    for (const wait of waits) {
      if (
        wait.tile.suit === slot.tile.suit &&
        wait.tile.rank === slot.tile.rank &&
        wait.tile.copyIndex === slot.tile.copyIndex
      ) {
        matches.push({
          slotIndex: slot.slotIndex,
          tile: slot.tile,
          wait,
        });
        break;
      }
    }
  }
  // Sort highest-scoring first so the default selection lands on the
  // best win available (matches the orchestrator's `compareWaitsByPoints`
  // ordering — points DESC, yaku count DESC, han DESC).
  matches.sort((a, b) => {
    if (b.wait.points !== a.wait.points) return b.wait.points - a.wait.points;
    if (b.wait.yaku.length !== a.wait.yaku.length)
      return b.wait.yaku.length - a.wait.yaku.length;
    return b.wait.han - a.wait.han;
  });
  return matches;
}

export function ClaimWinModal({
  atStation,
  waits,
  onConfirm,
  onClose,
  pending = false,
}: Props) {
  const claimable = useMemo(
    () => selectClaimableTiles(resolveStationSlots(atStation), waits),
    [atStation, waits],
  );
  const [selected, setSelected] = useState<string | null>(
    () => claimable[0]?.tile.instanceId ?? null,
  );
  const selectedClaim = useMemo(
    () => claimable.find((c) => c.tile.instanceId === selected) ?? null,
    [claimable, selected],
  );

  const canConfirm = Boolean(selected) && !pending;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal claim-win-modal">
        <header className="modal__header">
          <h2>Claim your hand</h2>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <p className="modal__hint">
          {claimable.length === 0
            ? "No tile at this station completes your hand."
            : "Pick the station tile you want to claim as your winning 14th tile."}
        </p>
        {claimable.length > 0 && (
          <section>
            <h3>Winning tiles at this station</h3>
            <ul className="station-panel__tile-grid">
              {claimable.map((entry) => (
                <li key={entry.tile.instanceId}>
                  <button
                    type="button"
                    className={`tile-pick${selected === entry.tile.instanceId ? " tile-pick--selected" : ""}`}
                    onClick={() => setSelected(entry.tile.instanceId)}
                    disabled={pending}
                    aria-label={`Claim ${entry.tile.displayName}`}
                  >
                    <img
                      src={tileImagePath(entry.tile)}
                      alt={entry.tile.displayName}
                      className="station-panel__tile-image"
                    />
                    <span className="claim-win-modal__tile-meta">
                      <span>{entry.tile.displayName}</span>
                      <span className="claim-win-modal__tile-points">
                        {entry.wait.isYakuman
                          ? "Yakuman"
                          : `${entry.wait.han} han / ${entry.wait.fu} fu · ${entry.wait.points} pts`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {selectedClaim && (
          <section className="claim-win-modal__preview">
            <h3>Score preview</h3>
            <ul className="claim-win-modal__yaku-list">
              {selectedClaim.wait.yaku.map((yaku, idx) => (
                <li key={`${yaku.name}-${idx}`}>
                  <span>{yaku.name}</span>
                  <span>{yaku.han} han</span>
                </li>
              ))}
            </ul>
            <p className="claim-win-modal__total">
              {selectedClaim.wait.isYakuman
                ? "Yakuman — locked"
                : `Total: ${selectedClaim.wait.han} han / ${selectedClaim.wait.fu} fu = ${selectedClaim.wait.points} points`}
            </p>
          </section>
        )}
        <footer className="modal__footer">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canConfirm}
            onClick={() => selected && onConfirm(selected)}
          >
            {pending ? "Claiming…" : "Claim winning hand"}
          </button>
        </footer>
      </div>
    </div>
  );
}
