interface Props {
  value: number | null;
  onPick: (teamSlot: number) => void;
}

const TEAMS = [1, 2, 3, 4] as const;

export function TeamPicker({ value, onPick }: Props) {
  return (
    <section>
      <h2 className="form__section-title">Your team</h2>
      <div className="team-picker">
        {TEAMS.map((slot) => (
          <button
            key={slot}
            type="button"
            className={`btn${value === slot ? " btn--primary" : " btn--secondary"}`}
            onClick={() => onPick(slot)}
          >
            Team {slot}
          </button>
        ))}
      </div>
    </section>
  );
}
