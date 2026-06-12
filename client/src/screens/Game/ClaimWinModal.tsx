import { useMemo, useState } from "react";
import { waitMatchesTile } from "../../lib/claimWin";
import { tileImagePath } from "../../lib/tileImages";
import type {
  AnalyzedWaitDto,
  AtStationDto,
  MapNodeTileDto,
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

/**
 * Phase J — pick the station tile to claim as the winning 14th.
 *
 * Phase L Chunk 4 B-2: consumes the exhaustive
 * `MapNodeTileDto[]` shape from `atStation.tiles[]`. Hidden / locked
 * slots have `tile: null` — those are never claimable, so we skip
 * them before matching against the team's tenpai waits.
 *
 * We filter the station's exposed slots to those whose tile type
 * matches a tenpai wait by `(suit, rank)`. The wait's `copyIndex`
 * is the orchestrator's scoring preference for a hypothetical 14th
 * tile; the physical station copy may differ (e.g. non-red 5p while
 * the wait lists copyIndex 0). The server re-scores using the
 * claimed instance.
 */
function selectClaimableTiles(
  slots: ReadonlyArray<MapNodeTileDto>,
  waits: ReadonlyArray<AnalyzedWaitDto>,
): ClaimableTile[] {
  const matches: ClaimableTile[] = [];
  for (const slot of slots) {
    if (slot.tile == null) continue;
    const tile = slot.tile;
    const matchingWaits = waits.filter((wait) => waitMatchesTile(wait, tile));
    if (matchingWaits.length === 0) continue;
    matchingWaits.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.yaku.length !== a.yaku.length) return b.yaku.length - a.yaku.length;
      return b.han - a.han;
    });
    matches.push({
      slotIndex: slot.slotIndex,
      tile,
      wait: matchingWaits[0]!,
    });
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
    () => selectClaimableTiles(atStation.tiles, waits),
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
          <section className="claim-win-modal__section">
            <h3 className="claim-win-modal__section-title">
              Winning tiles at this station
            </h3>
            <ul className="claim-win-modal__tile-list">
              {claimable.map((entry) => {
                const isSelected = selected === entry.tile.instanceId;
                const scoreLabel = entry.wait.isYakuman
                  ? "Yakuman"
                  : `${entry.wait.han} han / ${entry.wait.fu} fu · ${entry.wait.points.toLocaleString()} pts`;
                return (
                  <li key={entry.tile.instanceId}>
                    <button
                      type="button"
                      className={`claim-win-modal__tile-option${isSelected ? " claim-win-modal__tile-option--selected" : ""}`}
                      onClick={() => setSelected(entry.tile.instanceId)}
                      disabled={pending}
                      aria-pressed={isSelected}
                      aria-label={`Claim ${entry.tile.displayName}, ${scoreLabel}`}
                    >
                      <img
                        src={tileImagePath(entry.tile)}
                        alt=""
                        aria-hidden="true"
                        className="station-panel__tile-image station-panel__tile-image--large"
                      />
                      <span className="claim-win-modal__tile-copy">
                        <span className="claim-win-modal__tile-name">
                          {entry.tile.displayName}
                        </span>
                        <span className="claim-win-modal__tile-score">{scoreLabel}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {selectedClaim && (
          <section className="claim-win-modal__preview">
            <h3 className="claim-win-modal__section-title">Score preview</h3>
            {selectedClaim.wait.isYakuman ? (
              <p className="claim-win-modal__yakuman">Yakuman — locked</p>
            ) : (
              <>
                <ul className="claim-win-modal__yaku-list">
                  {selectedClaim.wait.yaku.map((yaku, idx) => (
                    <li key={`${yaku.name}-${idx}`}>
                      <span className="claim-win-modal__yaku-name">{yaku.name}</span>
                      <span className="claim-win-modal__yaku-han">{yaku.han} han</span>
                    </li>
                  ))}
                </ul>
                <p className="claim-win-modal__total">
                  <span className="claim-win-modal__total-label">Total</span>
                  <span className="claim-win-modal__total-value">
                    {selectedClaim.wait.han} han / {selectedClaim.wait.fu} fu ={" "}
                    {selectedClaim.wait.points.toLocaleString()} points
                  </span>
                </p>
              </>
            )}
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
