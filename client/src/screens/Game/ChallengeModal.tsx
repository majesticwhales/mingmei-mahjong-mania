export interface ChallengeModalContent {
  title: string;
  description: string | null;
  flavorText?: string | null;
  /** Optional illustration URL — populated by the backend when available. */
  imageUrl?: string | null;
}

interface Props extends ChallengeModalContent {
  onComplete: () => void;
  onAbandon: () => void;
  onClose: () => void;
  pending?: boolean;
  completeDisabled?: boolean;
}

export function ChallengeModal({
  title,
  description,
  flavorText,
  imageUrl,
  onComplete,
  onAbandon,
  onClose,
  pending = false,
  completeDisabled = false,
}: Props) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="challenge-modal-title">
      <div className="modal challenge-modal">
        <header className="modal__header">
          <h2 id="challenge-modal-title">Station challenge</h2>
          <button type="button" className="btn btn--ghost" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="challenge-modal__body">
          <h3 className="challenge-modal__title">{title}</h3>
          {description && <p className="challenge-modal__description">{description}</p>}
          {flavorText && <p className="challenge-modal__flavor">{flavorText}</p>}

          <div
            className={`challenge-modal__image${imageUrl ? "" : " challenge-modal__image--empty"}`}
            aria-label={imageUrl ? "Challenge illustration" : "Challenge illustration placeholder"}
          >
            {imageUrl ? (
              <img src={imageUrl} alt="" className="challenge-modal__image-media" />
            ) : (
              <span className="challenge-modal__image-placeholder">Image optional</span>
            )}
          </div>
        </div>

        <footer className="modal__footer challenge-modal__footer">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={pending}
            onClick={onAbandon}
          >
            Abandon challenge
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={pending || completeDisabled}
            onClick={onComplete}
          >
            {pending ? "Saving…" : "Complete challenge"}
          </button>
        </footer>
      </div>
    </div>
  );
}
