import { FormEvent, useState } from "react";
import type { LobbyNotificationDto } from "../../wire/lobby";

interface Props {
  notifications: LobbyNotificationDto[];
  onAdd: (input: { atSeconds: number; template: string }) => Promise<void>;
  onUpdate: (id: string, patch: Partial<{ atSeconds: number; template: string }>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

function formatSeconds(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function NotificationsEditor({ notifications, onAdd, onUpdate, onRemove }: Props) {
  const [atSeconds, setAtSeconds] = useState(1800);
  const [template, setTemplate] = useState("halfway");

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    await onAdd({ atSeconds, template });
  }

  return (
    <section>
      <h2 className="form__section-title">Notifications</h2>
      <ul className="member-list">
        {notifications.map((notification) => (
          <li key={notification.id}>
            <span>
              @ {formatSeconds(notification.atSeconds)} {notification.template}
            </span>
            <span>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() =>
                  onUpdate(notification.id, {
                    template: `${notification.template}-updated`,
                  })
                }
              >
                edit
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => onRemove(notification.id)}
              >
                x
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form className="form form--inline" onSubmit={handleAdd}>
        <label className="form__field">
          <span>At (sec)</span>
          <input
            type="number"
            min={0}
            value={atSeconds}
            onChange={(e) => setAtSeconds(Number(e.target.value))}
          />
        </label>
        <label className="form__field">
          <span>Template</span>
          <input value={template} onChange={(e) => setTemplate(e.target.value)} />
        </label>
        <button className="btn btn--secondary" type="submit">
          +
        </button>
      </form>
    </section>
  );
}
