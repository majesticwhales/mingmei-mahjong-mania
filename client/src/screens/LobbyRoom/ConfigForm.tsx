import {
  FormEvent,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import {
  lobbyConfigHasPendingChanges,
  lobbyConfigPatchFromDto,
} from "../../lib/lobbyConfig";
import { restClient } from "../../transport/restClient";
import type {
  LobbyConfigDto,
  LobbyConfigPatch,
  MapTemplateSummary,
  VisibilityMode,
} from "../../wire/lobby";

const VISIBILITY_MODES: readonly VisibilityMode[] = ["both", "phase", "slot", "none"];

export interface ConfigFormHandle {
  savePendingChanges: () => Promise<void>;
  hasPendingChanges: () => boolean;
}

interface Props {
  config: LobbyConfigDto;
  onSave: (patch: LobbyConfigPatch) => Promise<void>;
}

export const ConfigForm = forwardRef<ConfigFormHandle, Props>(function ConfigForm(
  { config, onSave },
  ref,
) {
  const [templates, setTemplates] = useState<MapTemplateSummary[]>([]);
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);
  const hasPendingChanges = lobbyConfigHasPendingChanges(draft, config);
  const phaseLayerActive =
    draft.visibilityMode === "phase" || draft.visibilityMode === "both";
  const phaseLockTitle = phaseLayerActive
    ? undefined
    : `Disabled while visibility mode = ${draft.visibilityMode}`;

  useEffect(() => {
    restClient.listMapTemplates().then(({ templates: list }) => setTemplates(list));
  }, []);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const saveDraft = useCallback(async () => {
    if (!lobbyConfigHasPendingChanges(draft, config)) return;
    setSaving(true);
    try {
      await onSave(lobbyConfigPatchFromDto(draft));
    } finally {
      setSaving(false);
    }
  }, [draft, config, onSave]);

  useImperativeHandle(
    ref,
    () => ({
      savePendingChanges: saveDraft,
      hasPendingChanges: () => lobbyConfigHasPendingChanges(draft, config),
    }),
    [draft, config, saveDraft],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await saveDraft();
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <h2 className="form__section-title">
        Config {hasPendingChanges ? "(unsaved changes)" : ""}
      </h2>
      <label className="form__field">
        <span>Map</span>
        <select
          value={draft.mapTemplateId}
          onChange={(e) => setDraft({ ...draft, mapTemplateId: e.target.value })}
        >
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>
      <label className="form__field">
        <span>Duration (sec)</span>
        <input
          type="number"
          min={60}
          value={draft.gameDurationSeconds}
          onChange={(e) =>
            setDraft({ ...draft, gameDurationSeconds: Number(e.target.value) })
          }
        />
      </label>
      <label className="form__field">
        <span>Visibility phases</span>
        <input
          type="number"
          min={1}
          value={draft.visibilityPhaseCount}
          disabled={!phaseLayerActive}
          title={phaseLockTitle}
          onChange={(e) =>
            setDraft({ ...draft, visibilityPhaseCount: Number(e.target.value) })
          }
        />
      </label>
      <label className="form__field">
        <span>Phase interval (sec)</span>
        <input
          type="number"
          min={1}
          value={draft.visibilityPhaseIntervalSeconds}
          disabled={!phaseLayerActive}
          title={phaseLockTitle}
          onChange={(e) =>
            setDraft({
              ...draft,
              visibilityPhaseIntervalSeconds: Number(e.target.value),
            })
          }
        />
      </label>
      <label className="form__field">
        <span>Slots per node</span>
        <input
          type="number"
          min={1}
          max={4}
          value={draft.slotsPerNode}
          onChange={(e) => setDraft({ ...draft, slotsPerNode: Number(e.target.value) })}
        />
      </label>
      <label className="form__field">
        <span>Visibility mode</span>
        <select
          value={draft.visibilityMode}
          onChange={(e) =>
            setDraft({ ...draft, visibilityMode: e.target.value as VisibilityMode })
          }
        >
          {VISIBILITY_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>
      <label className="form__field">
        <span>Team mode</span>
        <select
          value={draft.teamAssignmentMode}
          onChange={(e) =>
            setDraft({
              ...draft,
              teamAssignmentMode: e.target.value as LobbyConfigDto["teamAssignmentMode"],
            })
          }
        >
          <option value="pick">pick</option>
          <option value="random">random</option>
          <option value="mixed">mixed</option>
        </select>
      </label>
      <button className="btn btn--secondary" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save config"}
      </button>
    </form>
  );
});
