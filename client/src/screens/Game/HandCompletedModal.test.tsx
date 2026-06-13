import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HandCompletedDto } from "../../wire/projection";
import { HandCompletedModal } from "./HandCompletedModal";

const baseSnapshot: HandCompletedDto = {
  completedAt: "2026-06-10T18:00:00.000Z",
  winningTile: {
    instanceId: "tile-1",
    suit: "pin",
    rank: 5,
    copyIndex: 0,
    displayName: "5 of Pin",
    isRedFive: false,
  },
  winningNodeCode: "TKY",
  winningNodeName: "Tokyo",
  finalHan: 4,
  finalFu: 30,
  finalPoints: 8000,
  finalYaku: [
    { name: "Riichi", han: 1 },
    { name: "Tanyao", han: 1 },
    { name: "Pinfu", han: 1 },
    { name: "Dora", han: 1 },
  ],
};

describe("HandCompletedModal", () => {
  it("renders the winning station, points, han/fu, and yaku breakdown", () => {
    render(
      <HandCompletedModal handCompleted={baseSnapshot} onClose={vi.fn()} />,
    );

    expect(screen.getByRole("heading", { name: "Hand completed" })).toBeInTheDocument();
    expect(screen.getByText(/won at/i)).toBeInTheDocument();
    expect(screen.getByText("Tokyo")).toBeInTheDocument();
    expect(screen.getAllByText(/8,?000/).length).toBeGreaterThan(0);
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("Riichi")).toBeInTheDocument();
    expect(screen.getByText("Tanyao")).toBeInTheDocument();
    expect(screen.getByText("Pinfu")).toBeInTheDocument();
    expect(screen.getByText("Dora")).toBeInTheDocument();
  });

  it("renders 'Waiting for other teams' when no completion count is provided", () => {
    render(
      <HandCompletedModal handCompleted={baseSnapshot} onClose={vi.fn()} />,
    );
    expect(
      screen.getByText("Waiting for other teams to finish."),
    ).toBeInTheDocument();
  });

  it("renders a teams-completed count when more than one team is done", () => {
    render(
      <HandCompletedModal
        handCompleted={baseSnapshot}
        teamsCompletedCount={3}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText("3 teams have completed. Game end is imminent."),
    ).toBeInTheDocument();
  });

  it("hides fu as '—' on yakuman snapshots", () => {
    const yakuman: HandCompletedDto = {
      ...baseSnapshot,
      finalHan: 13,
      finalFu: 0,
      finalPoints: 32000,
      finalYaku: [{ name: "Daisangen", han: 13 }],
    };
    render(<HandCompletedModal handCompleted={yakuman} onClose={vi.fn()} />);

    const fuValues = screen.getAllByText("—");
    expect(fuValues.length).toBeGreaterThan(0);
    expect(screen.getByText(/32,?000/)).toBeInTheDocument();
    expect(screen.getByText("Yakuman")).toBeInTheDocument();
  });

  it("invokes onClose from the footer, close button, and backdrop", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <HandCompletedModal handCompleted={baseSnapshot} onClose={onClose} />,
    );

    await user.click(screen.getByRole("button", { name: /continue exploring/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    const backdrop = container.querySelector(".modal-backdrop");
    expect(backdrop).not.toBeNull();
    await user.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
