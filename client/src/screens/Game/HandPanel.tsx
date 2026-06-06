import { tileImagePath } from "../../lib/tileImages";
import type { HandTileDto } from "../../wire/projection";

interface Props {
  handTiles: HandTileDto[];
}

export function HandPanel({ handTiles }: Props) {
  return (
    <section className="game-hand">
      <h3 className="game-hand__title">Your hand ({handTiles.length})</h3>
      <ul className="station-panel__tile-grid">
        {[...handTiles]
          .sort((a, b) => a.slotIndex - b.slotIndex)
          .map((tile) => (
            <li className="station-panel__tile" key={tile.instanceId}>
              <img
                src={tileImagePath(tile)}
                alt={tile.displayName}
                className="station-panel__tile-image"
              />
            </li>
          ))}
      </ul>
    </section>
  );
}
