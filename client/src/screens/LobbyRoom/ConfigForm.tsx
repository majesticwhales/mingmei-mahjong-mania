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
import {
  deriveAutoDistributedOffsets,
  offsetsMatchAutoDistribute,
  resizeSlotMapVisible,
} from "../../lib/slotTier";
import { restClient } from "../../transport/restClient";
import type {
  LobbyConfigDto,
  LobbyConfigPatch,
  MapTemplateSummary,
  VisibilityMode,
} from "../../wire/lobby";

const VISIBILITY_MODES: readonly VisibilityMode[] = ["both", "phase", "slot", "none"];

function resizeSlotUnlockOffsets(
  prev: number[],
  slotsPerNode: number,
  gameDurationSeconds: number,
  useFormula: boolean,
): number[] {
  if (useFormula) {
    return deriveAutoDistributedOffsets(slotsPerNode, gameDurationSeconds);
  }
  const formulaDefault = deriveAutoDistributedOffsets(slotsPerNode, gameDurationSeconds);
  const out: number[] = [];
  for (let k = 0; k < slotsPerNode; k += 1) {
    out.push(k === 0 ? 0 : k < prev.length ? prev[k] : formulaDefault[k]);
  }
  return out;
}

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
  const [autoDistribute, setAutoDistribute] = useState(() =>
    offsetsMatchAutoDistribute(
      config.slotUnlockOffsetsSeconds,
      config.slotsPerNode,
      config.gameDurationSeconds,
    ),
  );
  const hasPendingChanges = lobbyConfigHasPendingChanges(draft, config);
  const phaseLayerActive =
    draft.visibilityMode === "phase" || draft.visibilityMode === "both";
  const slotLayerActive =
    draft.visibilityMode === "slot" || draft.visibilityMode === "both";
  const phaseLockTitle = phaseLayerActive
    ? undefined
    : `Disabled while visibility mode = ${draft.visibilityMode}`;
  const slotLockTitle = slotLayerActive
    ? undefined
    : `Disabled while visibility mode = ${draft.visibilityMode}`;

  useEffect(() => {
    restClient.listMapTemplates().then(({ templates: list }) => setTemplates(list));
  }, []);

  useEffect(() => {
    setDraft(config);
    setAutoDistribute(
      offsetsMatchAutoDistribute(
        config.slotUnlockOffsetsSeconds,
        config.slotsPerNode,
        config.gameDurationSeconds,
      ),
    );
  }, [config]);

  const updateSlotsPerNode = useCallback(
    (next: number) => {
      setDraft((prev) => ({
        ...prev,
        slotsPerNode: next,
        slotUnlockOffsetsSeconds: resizeSlotUnlockOffsets(
          prev.slotUnlockOffsetsSeconds,
          next,
          prev.gameDurationSeconds,
          autoDistribute,
        ),
        slotMapVisible: resizeSlotMapVisible(prev.slotMapVisible, next),
      }));
    },
    [autoDistribute],
  );

  const updateGameDuration = useCallback(
    (next: number) => {
      setDraft((prev) => ({
        ...prev,
        gameDurationSeconds: next,
        slotUnlockOffsetsSeconds: autoDistribute
          ? deriveAutoDistributedOffsets(prev.slotsPerNode, next)
          : prev.slotUnlockOffsetsSeconds,
      }));
    },
    [autoDistribute],
  );

  const toggleAutoDistribute = useCallback((next: boolean) => {
    setAutoDistribute(next);
    if (next) {
      setDraft((prev) => ({
        ...prev,
        slotUnlockOffsetsSeconds: deriveAutoDistributedOffsets(
          prev.slotsPerNode,
          prev.gameDurationSeconds,
        ),
      }));
    }
  }, []);

  const updateSlotOffset = useCallback((slotIndex: number, value: number) => {
    setDraft((prev) => {
      const next = prev.slotUnlockOffsetsSeconds.slice();
      next[slotIndex] = slotIndex === 0 ? 0 : value;
      return { ...prev, slotUnlockOffsetsSeconds: next };
    });
  }, []);

  const updateSlotMapVisible = useCallback((slotIndex: number, value: boolean) => {
    setDraft((prev) => {
      const next = prev.slotMapVisible.slice();
      next[slotIndex] = slotIndex === 0 ? true : value;
      return { ...prev, slotMapVisible: next };
    });
  }, []);

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
          onChange={(e) => updateGameDuration(Number(e.target.value))}
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
      <fieldset className="form__fieldset">
        <legend>Slot tier</legend>
        <label className="form__field">
          <span>Slots per node</span>
          <input
            type="number"
            min={1}
            max={4}
            value={draft.slotsPerNode}
            onChange={(e) => updateSlotsPerNode(Number(e.target.value))}
          />
        </label>
        <label className="form__field">
          <span>Auto-distribute unlock times</span>
          <input
            type="checkbox"
            checked={autoDistribute}
            disabled={!slotLayerActive}
            title={slotLockTitle}
            onChange={(e) => toggleAutoDistribute(e.target.checked)}
          />
        </label>
        {draft.slotUnlockOffsetsSeconds.map((offset, slotIndex) => {
          const isSlotZero = slotIndex === 0;
          const offsetDisabled = isSlotZero || autoDistribute || !slotLayerActive;
          const visibleDisabled = isSlotZero || !slotLayerActive;
          const offsetTitle = !slotLayerActive
            ? slotLockTitle
            : autoDistribute && !isSlotZero
              ? "Disabled while auto-distribute is on"
              : isSlotZero
                ? "Slot 0 unlocks at game start"
                : undefined;
          const visibleTitle = !slotLayerActive
            ? slotLockTitle
            : isSlotZero
              ? "Slot 0 follows phase rules"
              : undefined;
          return (
            <div className="form__slot-row" key={slotIndex}>
              <label className="form__field">
                <span>{`Slot ${slotIndex} unlock (sec)`}</span>
                <input
                  type="number"
                  min={0}
                  value={offset}
                  disabled={offsetDisabled}
                  title={offsetTitle}
                  onChange={(e) => updateSlotOffset(slotIndex, Number(e.target.value))}
                />
              </label>
              <label className="form__field">
                <span>{`Slot ${slotIndex} map visible`}</span>
                <input
                  type="checkbox"
                  checked={draft.slotMapVisible[slotIndex] ?? true}
                  disabled={visibleDisabled}
                  title={visibleTitle}
                  onChange={(e) => updateSlotMapVisible(slotIndex, e.target.checked)}
                />
              </label>
            </div>
          );
        })}
      </fieldset>
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
