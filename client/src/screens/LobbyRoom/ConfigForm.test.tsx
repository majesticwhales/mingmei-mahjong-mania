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
