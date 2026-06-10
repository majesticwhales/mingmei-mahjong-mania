import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HandCompletedDto } from "../../wire/projection";
import { HandCompletedBanner } from "./HandCompletedBanner";

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

describe("HandCompletedBanner", () => {
  it("renders the winning station, points, han/fu, and yaku breakdown", () => {
    render(<HandCompletedBanner handCompleted={baseSnapshot} />);

    expect(screen.getByText("Won at TKY")).toBeInTheDocument();
    expect(screen.getByText("8000")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("Riichi")).toBeInTheDocument();
    expect(screen.getByText("Tanyao")).toBeInTheDocument();
    expect(screen.getByText("Pinfu")).toBeInTheDocument();
    expect(screen.getByText("Dora")).toBeInTheDocument();
  });

  it("renders 'Waiting for other teams' when no completion count is provided", () => {
    render(<HandCompletedBanner handCompleted={baseSnapshot} />);
    expect(
      screen.getByText("Waiting for other teams to finish."),
    ).toBeInTheDocument();
  });

  it("renders a teams-completed count when more than one team is done", () => {
    render(
      <HandCompletedBanner handCompleted={baseSnapshot} teamsCompletedCount={3} />,
    );
    expect(screen.getByText("3 teams have completed.")).toBeInTheDocument();
  });

  it("hides fu as '—' on yakuman snapshots", () => {
    const yakuman: HandCompletedDto = {
      ...baseSnapshot,
      finalHan: 13,
      finalFu: 0,
      finalPoints: 32000,
      finalYaku: [{ name: "Daisangen", han: 13 }],
    };
    render(<HandCompletedBanner handCompleted={yakuman} />);

    const fuValues = screen.getAllByText("—");
    expect(fuValues.length).toBeGreaterThan(0);
    expect(screen.getByText("32000")).toBeInTheDocument();
  });
});
