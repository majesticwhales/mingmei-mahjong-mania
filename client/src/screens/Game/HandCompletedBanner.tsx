import { tileImagePath } from "../../lib/tileImages";
import type { HandCompletedDto } from "../../wire/projection";

interface Props {
  handCompleted: HandCompletedDto;
  /**
   * Optional total count of teams known to have completed (server's
   * `teamsCompleted.length`). When `> 1`, the banner notes that other
   * teams have also claimed — game-end is imminent.
   */
  teamsCompletedCount?: number;
}

/**
 * Phase J — top-of-screen banner shown to a team that has successfully
 * `CLAIM_WIN`-ed. Read-only: every mutation handler is locked once
 * `hand_completed_at` is set, so the panel doubles as the team's
 * "you're done — waiting for game end" landing surface until the
 * server flips the projection to `status: 'ended'` and the screen
 * auto-navigates to the summary.
 */
export function HandCompletedBanner({
  handCompleted,
  teamsCompletedCount,
}: Props) {
  const isYakuman = handCompleted.finalFu === 0 && handCompleted.finalHan > 0;
  const completedAt = new Date(handCompleted.completedAt);
  const waitingNote =
    teamsCompletedCount != null && teamsCompletedCount > 1
      ? `${teamsCompletedCount} teams have completed.`
      : "Waiting for other teams to finish.";

  return (
    <section
      className="hand-completed-banner"
      role="status"
      aria-label="Hand completed"
    >
      <header className="hand-completed-banner__header">
        <div>
          <p className="hand-completed-banner__eyebrow">Hand completed</p>
          <h2 className="hand-completed-banner__title">
            Won at {handCompleted.winningNodeCode}
          </h2>
        </div>
        <img
          src={tileImagePath(handCompleted.winningTile)}
          alt={handCompleted.winningTile.displayName}
          title={handCompleted.winningTile.displayName}
          className="hand-completed-banner__tile-image"
        />
      </header>
      <dl className="hand-completed-banner__stats">
        <div>
          <dt>Han</dt>
          <dd>{handCompleted.finalHan}</dd>
        </div>
        <div>
          <dt>Fu</dt>
          <dd>{isYakuman ? "—" : handCompleted.finalFu}</dd>
        </div>
        <div>
          <dt>Points</dt>
          <dd>{handCompleted.finalPoints}</dd>
        </div>
      </dl>
      {handCompleted.finalYaku.length > 0 && (
        <ul className="hand-completed-banner__yaku-list">
          {handCompleted.finalYaku.map((yaku, idx) => (
            <li key={`${yaku.name}-${idx}`}>
              <span>{yaku.name}</span>
              <span>{yaku.han} han</span>
            </li>
          ))}
        </ul>
      )}
      <p className="hand-completed-banner__footer">
        <time dateTime={handCompleted.completedAt}>
          {completedAt.toLocaleTimeString()}
        </time>
        <span>{waitingNote}</span>
      </p>
    </section>
  );
}
