import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { restClient } from "../../transport/restClient";
import type { LobbyConfigDto } from "../../wire/lobby";
import { ConfigForm } from "./ConfigForm";

const baseConfig: LobbyConfigDto = {
  mapTemplateId: "map-1",
  gameDurationSeconds: 7200,
  visibilityPhaseIntervalSeconds: 1800,
  visibilityPhaseCount: 4,
  slotsPerNode: 1,
  slotUnlockOffsetsSeconds: [0],
  slotMapVisible: [true],
  deadWallSize: 14,
  teamAssignmentMode: "pick",
  visibilityMode: "both",
  minPlayersToStart: 4,
  defaultStartNodeCode: null,
  configUpdatedAt: null,
};

function stubTemplates() {
  vi.spyOn(restClient, "listMapTemplates").mockResolvedValue({
    templates: [{ id: "map-1", name: "Tokyo", description: null, nodeCount: 12 }],
  });
}

describe("ConfigForm — visibility mode (chunk 6)", () => {
  it("renders the visibility mode select with the saved value pre-selected", async () => {
    stubTemplates();
    render(<ConfigForm config={baseConfig} onSave={vi.fn()} />);

    const select = await screen.findByLabelText("Visibility mode");
    expect(select).toHaveValue("both");
  });

  it("disables phase inputs when mode excludes phase (slot, none)", async () => {
    stubTemplates();
    const { rerender } = render(
      <ConfigForm config={{ ...baseConfig, visibilityMode: "slot" }} onSave={vi.fn()} />,
    );

    const phases = await screen.findByLabelText("Visibility phases");
    const interval = screen.getByLabelText("Phase interval (sec)");
    expect(phases).toBeDisabled();
    expect(interval).toBeDisabled();

    rerender(
      <ConfigForm config={{ ...baseConfig, visibilityMode: "none" }} onSave={vi.fn()} />,
    );
    expect(screen.getByLabelText("Visibility phases")).toBeDisabled();
    expect(screen.getByLabelText("Phase interval (sec)")).toBeDisabled();
  });

  it("keeps phase inputs enabled when mode includes phase (phase, both)", async () => {
    stubTemplates();
    const { rerender } = render(
      <ConfigForm config={{ ...baseConfig, visibilityMode: "phase" }} onSave={vi.fn()} />,
    );

    const phases = await screen.findByLabelText("Visibility phases");
    expect(phases).not.toBeDisabled();
    expect(screen.getByLabelText("Phase interval (sec)")).not.toBeDisabled();

    rerender(<ConfigForm config={baseConfig} onSave={vi.fn()} />);
    expect(screen.getByLabelText("Visibility phases")).not.toBeDisabled();
    expect(screen.getByLabelText("Phase interval (sec)")).not.toBeDisabled();
  });

  it("sends a patch with the new visibilityMode on save", async () => {
    stubTemplates();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ConfigForm config={baseConfig} onSave={onSave} />);

    const select = await screen.findByLabelText("Visibility mode");
    await userEvent.selectOptions(select, "slot");
    await userEvent.click(screen.getByRole("button", { name: /save config/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ visibilityMode: "slot" });
  });
});

describe("ConfigForm — slot tier (chunk 7)", () => {
  const fourSlotAuto: LobbyConfigDto = {
    ...baseConfig,
    slotsPerNode: 4,
    slotUnlockOffsetsSeconds: [0, 1800, 3600, 5400],
    slotMapVisible: [true, true, true, true],
  };

  const fourSlotCustom: LobbyConfigDto = {
    ...baseConfig,
    slotsPerNode: 4,
    slotUnlockOffsetsSeconds: [0, 600, 1200, 1800],
    slotMapVisible: [true, true, false, true],
  };

  it("derives auto-distribute = ON when saved offsets match the formula", async () => {
    stubTemplates();
    render(<ConfigForm config={fourSlotAuto} onSave={vi.fn()} />);

    const toggle = await screen.findByLabelText("Auto-distribute unlock times");
    expect(toggle).toBeChecked();
  });

  it("derives auto-distribute = OFF when saved offsets diverge from the formula", async () => {
    stubTemplates();
    render(<ConfigForm config={fourSlotCustom} onSave={vi.fn()} />);

    const toggle = await screen.findByLabelText("Auto-distribute unlock times");
    expect(toggle).not.toBeChecked();
  });

  it("regenerates offsets to the formula when slots-per-node changes with auto-distribute ON", async () => {
    stubTemplates();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ConfigForm config={baseConfig} onSave={onSave} />);

    const slotsInput = await screen.findByLabelText("Slots per node");
    await userEvent.clear(slotsInput);
    await userEvent.type(slotsInput, "4");
    await userEvent.click(screen.getByRole("button", { name: /save config/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      slotsPerNode: 4,
      slotUnlockOffsetsSeconds: [0, 1800, 3600, 5400],
    });
  });

  it("sends user-edited offsets when auto-distribute is OFF", async () => {
    stubTemplates();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ConfigForm config={fourSlotCustom} onSave={onSave} />);

    const slot1 = await screen.findByLabelText("Slot 1 unlock (sec)");
    expect(slot1).not.toBeDisabled();
    await userEvent.clear(slot1);
    await userEvent.type(slot1, "900");
    await userEvent.click(screen.getByRole("button", { name: /save config/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const patch = onSave.mock.calls[0]?.[0] as { slotUnlockOffsetsSeconds: number[] };
    expect(patch.slotUnlockOffsetsSeconds).toEqual([0, 900, 1200, 1800]);
  });

  it("snaps offsets back to the formula when auto-distribute is toggled ON from a custom array", async () => {
    stubTemplates();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ConfigForm config={fourSlotCustom} onSave={onSave} />);

    const toggle = await screen.findByLabelText("Auto-distribute unlock times");
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(toggle).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: /save config/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      slotUnlockOffsetsSeconds: [0, 1800, 3600, 5400],
    });
  });

  it("greys out the entire slot tier section when mode excludes slot", async () => {
    stubTemplates();
    render(
      <ConfigForm
        config={{ ...fourSlotAuto, visibilityMode: "phase" }}
        onSave={vi.fn()}
      />,
    );

    expect(await screen.findByLabelText("Slots per node")).not.toBeDisabled();
    expect(screen.getByLabelText("Auto-distribute unlock times")).toBeDisabled();
    expect(screen.getByLabelText("Slot 1 unlock (sec)")).toBeDisabled();
    expect(screen.getByLabelText("Slot 2 unlock (sec)")).toBeDisabled();
    expect(screen.getByLabelText("Slot 1 map visible")).toBeDisabled();
    expect(screen.getByLabelText("Slot 2 map visible")).toBeDisabled();
  });

  it("keeps slot tier editable but disables phase knobs when mode = slot", async () => {
    stubTemplates();
    render(
      <ConfigForm
        config={{ ...fourSlotCustom, visibilityMode: "slot" }}
        onSave={vi.fn()}
      />,
    );

    expect(await screen.findByLabelText("Visibility phases")).toBeDisabled();
    expect(screen.getByLabelText("Phase interval (sec)")).toBeDisabled();
    expect(screen.getByLabelText("Auto-distribute unlock times")).not.toBeDisabled();
    expect(screen.getByLabelText("Slot 1 unlock (sec)")).not.toBeDisabled();
    expect(screen.getByLabelText("Slot 1 map visible")).not.toBeDisabled();
  });

  it("keeps slot 0 controls locked even when slot layer is on", async () => {
    stubTemplates();
    render(<ConfigForm config={fourSlotCustom} onSave={vi.fn()} />);

    expect(await screen.findByLabelText("Slot 0 unlock (sec)")).toBeDisabled();
    expect(screen.getByLabelText("Slot 0 map visible")).toBeDisabled();
  });
});
