import { doraTileFromIndicator, doraTileLabel } from "../../lib/dora";
import { tileImagePath } from "../../lib/tileImages";
import { windRankImagePath, windRankLabel } from "../../lib/windLabel";
import type { TileDto } from "../../wire/projection";

interface Props {
  seatWind: number;
  roundWind: number;
  doraIndicator: TileDto | null;
}

export function GameHeaderTiles({ seatWind, roundWind, doraIndicator }: Props) {
  const seatLabel = windRankLabel(seatWind);
  const roundLabel = windRankLabel(roundWind);
  const doraDisplay =
    doraIndicator == null
      ? null
      : (() => {
          const tile = doraTileFromIndicator(doraIndicator);
          return {
            label: doraTileLabel(tile),
            imagePath: tileImagePath({
              ...doraIndicator,
              suit: tile.suit,
              rank: tile.rank,
              isRedFive: false,
            }),
          };
        })();

  return (
    <div className="game-header-tiles">
      <div className="game-header-tiles__item">
        <span className="game-header-tiles__label">Round</span>
        <img
          src={windRankImagePath(roundWind)}
          alt={roundLabel}
          className="game-header-tiles__tile"
        />
      </div>
      <div className="game-header-tiles__item">
        <span className="game-header-tiles__label">Seat</span>
        <img
          src={windRankImagePath(seatWind)}
          alt={seatLabel}
          className="game-header-tiles__tile"
        />
      </div>
      {doraDisplay && (
        <div className="game-header-tiles__item">
          <span className="game-header-tiles__label">Dora</span>
          <img
            src={doraDisplay.imagePath}
            alt={doraDisplay.label}
            className="game-header-tiles__tile"
          />
        </div>
      )}
    </div>
  );
}
