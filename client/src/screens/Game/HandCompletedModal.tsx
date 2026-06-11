import { tileImagePath } from "../../lib/tileImages";
import type { HandCompletedDto } from "../../wire/projection";

interface Props {
  handCompleted: HandCompletedDto;
  /**
   * Optional total count of teams known to have completed (server's
   * `teamsCompleted.length`). When `> 1`, the modal notes that other
   * teams have also claimed — game-end is imminent.
   */
  teamsCompletedCount?: number;
  onClose: () => void;
}

/**
 * Phase J — modal shown when a team has successfully `CLAIM_WIN`-ed.
 * Closeable so players can keep exploring the map; reopen via the
 * header "Your win" button until the game ends.
 */
export function HandCompletedModal({
  handCompleted,
  teamsCompletedCount,
  onClose,
}: Props) {
  const isYakuman = handCompleted.finalFu === 0 && handCompleted.finalHan > 0;
  const completedAt = new Date(handCompleted.completedAt);
  const waitingNote =
    teamsCompletedCount != null && teamsCompletedCount > 1
      ? `${teamsCompletedCount} teams have completed. Game end is imminent.`
      : "Waiting for other teams to finish.";

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hand-completed-title"
      onClick={onClose}
    >
      <div
        className="modal hand-completed-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="hand-completed-title">Hand completed</h2>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="hand-completed-modal__hero">
          <img
            src={tileImagePath(handCompleted.winningTile)}
            alt=""
            aria-hidden="true"
            className="station-panel__tile-image station-panel__tile-image--large hand-completed-modal__tile"
          />
          <div className="hand-completed-modal__hero-copy">
            <p className="hand-completed-modal__eyebrow">Winning tile</p>
            <p className="hand-completed-modal__station">
              Won at <strong>{handCompleted.winningNodeCode}</strong>
            </p>
            <p className="hand-completed-modal__tile-name">
              {handCompleted.winningTile.displayName}
            </p>
          </div>
        </div>

        <dl className="hand-completed-modal__stats">
          <div className="hand-completed-modal__stat">
            <dt>Han</dt>
            <dd>{handCompleted.finalHan}</dd>
          </div>
          <div className="hand-completed-modal__stat">
            <dt>Fu</dt>
            <dd>{isYakuman ? "—" : handCompleted.finalFu}</dd>
          </div>
          <div className="hand-completed-modal__stat">
            <dt>Points</dt>
            <dd>{handCompleted.finalPoints.toLocaleString()}</dd>
          </div>
        </dl>

        {handCompleted.finalYaku.length > 0 && (
          <section className="hand-completed-modal__score">
            <h3 className="hand-completed-modal__section-title">Final score</h3>
            {isYakuman ? (
              <p className="hand-completed-modal__yakuman">Yakuman</p>
            ) : (
              <>
                <ul className="hand-completed-modal__yaku-list">
                  {handCompleted.finalYaku.map((yaku, idx) => (
                    <li key={`${yaku.name}-${idx}`}>
                      <span className="hand-completed-modal__yaku-name">{yaku.name}</span>
                      <span className="hand-completed-modal__yaku-han">{yaku.han} han</span>
                    </li>
                  ))}
                </ul>
                <p className="hand-completed-modal__total">
                  <span className="hand-completed-modal__total-label">Total</span>
                  <span className="hand-completed-modal__total-value">
                    {handCompleted.finalHan} han / {handCompleted.finalFu} fu ={" "}
                    {handCompleted.finalPoints.toLocaleString()} points
                  </span>
                </p>
              </>
            )}
          </section>
        )}

        <p className="hand-completed-modal__status">
          <time dateTime={handCompleted.completedAt}>
            Completed {completedAt.toLocaleTimeString()}
          </time>
          <span>{waitingNote}</span>
        </p>

        <footer className="modal__footer hand-completed-modal__footer">
          <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
            Continue exploring
          </button>
        </footer>
      </div>
    </div>
  );
}
