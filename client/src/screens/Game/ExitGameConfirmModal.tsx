import { useState } from "react";

interface Props {
  variant: "leave" | "end_game";
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const END_GAME_CONFIRM_PHRASE = "endgame";

const COPY = {
  leave: {
    title: "Leave game?",
    hint: "You'll return to the lobby list. Your team's progress stays in the game.",
    confirm: "Leave",
  },
  end_game: {
    title: "End game for everyone?",
    hint: "This will finish the game for all teams and take you to the summary.",
    confirm: "End game",
  },
} as const;

export function ExitGameConfirmModal({
  variant,
  pending = false,
  onConfirm,
  onClose,
}: Props) {
  const copy = COPY[variant];
  const [confirmText, setConfirmText] = useState("");
  const endGameConfirmed =
    variant !== "end_game" || confirmText.trim() === END_GAME_CONFIRM_PHRASE;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-game-modal-title"
    >
      <div className="modal">
        <header className="modal__header">
          <h2 id="exit-game-modal-title">{copy.title}</h2>
          <button
            type="button"
            className="btn btn--ghost"
            aria-label="Close"
            onClick={onClose}
            disabled={pending}
          >
            ×
          </button>
        </header>
        <p className="modal__hint">{copy.hint}</p>
        {variant === "end_game" && (
          <label className="form__field">
            <span>Type {END_GAME_CONFIRM_PHRASE} to confirm</span>
            <input
              type="text"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={END_GAME_CONFIRM_PHRASE}
              disabled={pending}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
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
            className={`btn${variant === "end_game" ? " btn--danger" : " btn--primary"}`}
            onClick={onConfirm}
            disabled={pending || !endGameConfirmed}
          >
            {pending ? (variant === "end_game" ? "Ending…" : "Leaving…") : copy.confirm}
          </button>
        </footer>
      </div>
    </div>
  );
}
