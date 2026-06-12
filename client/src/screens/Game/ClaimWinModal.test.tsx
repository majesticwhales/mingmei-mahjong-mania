import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  AnalyzedWaitDto,
  AtStationDto,
  TileDto,
} from "../../wire/projection";
import { ClaimWinModal } from "./ClaimWinModal";

function tile(overrides: Partial<TileDto> & { suit: string; rank: number; copyIndex: number }): TileDto {
  return {
    instanceId: `${overrides.suit}-${overrides.rank}-${overrides.copyIndex}`,
    displayName: `${overrides.suit}${overrides.rank}-${overrides.copyIndex}`,
    isRedFive: false,
    ...overrides,
  };
}

function wait(
  suit: string,
  rank: number,
  copyIndex: number,
  overrides: Partial<AnalyzedWaitDto> = {},
): AnalyzedWaitDto {
  return {
    tile: { suit, rank, copyIndex },
    han: 2,
    fu: 30,
    points: 2000,
    yaku: [{ name: "Pinfu", han: 1 }],
    isYakuman: false,
    ...overrides,
  };
}

// Phase L Chunk 4 B-2: `AtStationDto.tiles[]` is the exhaustive
// `MapNodeTileDto[]` shape (`{ slotIndex, tile, visible, locked }`).
// All three slots are visible+unlocked here so the modal's claimable
// filter (which skips `tile === null`) sees them.
const atStation: AtStationDto = {
  nodeId: "node-1",
  code: "TKY",
  tiles: [
    {
      slotIndex: 0,
      tile: tile({ suit: "pin", rank: 5, copyIndex: 0 }),
      visible: true,
      locked: false,
    },
    {
      slotIndex: 1,
      tile: tile({ suit: "sou", rank: 9, copyIndex: 0 }),
      visible: true,
      locked: false,
    },
    {
      slotIndex: 2,
      tile: tile({ suit: "man", rank: 3, copyIndex: 0 }),
      visible: true,
      locked: false,
    },
  ],
};

describe("ClaimWinModal", () => {
  it("matches waits by suit and rank even when copyIndex differs", () => {
    const waits: AnalyzedWaitDto[] = [wait("pin", 5, 0)];
    const station: AtStationDto = {
      nodeId: "node-1",
      code: "TKY",
      tiles: [
        {
          slotIndex: 0,
          tile: tile({ suit: "pin", rank: 5, copyIndex: 2 }),
          visible: true,
          locked: false,
        },
      ],
    };
    render(
      <ClaimWinModal
        atStation={station}
        waits={waits}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /claim pin5-2/i })).toBeInTheDocument();
  });

  it("only renders station tiles that match a wait", () => {
    const waits: AnalyzedWaitDto[] = [
      wait("pin", 5, 0),
      wait("sou", 9, 0),
    ];
    render(
      <ClaimWinModal
        atStation={atStation}
        waits={waits}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /claim pin5-0/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /claim sou9-0/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /claim man3-0/i })).not.toBeInTheDocument();
  });

  it("defaults selection to the highest-scoring wait", () => {
    const waits: AnalyzedWaitDto[] = [
      wait("pin", 5, 0, { han: 1, fu: 30, points: 1000 }),
      wait("sou", 9, 0, { han: 5, fu: 30, points: 8000 }),
    ];
    render(
      <ClaimWinModal
        atStation={atStation}
        waits={waits}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/5 han \/ 30 fu = 8,?000 points/)).toBeInTheDocument();
    const sou = screen.getByRole("button", { name: /claim sou9-0/i });
    expect(sou.className).toContain("claim-win-modal__tile-option--selected");
  });

  it("invokes onConfirm with the selected station tile id", async () => {
    const onConfirm = vi.fn();
    const waits: AnalyzedWaitDto[] = [
      wait("pin", 5, 0, { han: 1, fu: 30, points: 1000 }),
      wait("sou", 9, 0, { han: 5, fu: 30, points: 8000 }),
    ];
    render(
      <ClaimWinModal
        atStation={atStation}
        waits={waits}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /claim pin5-0/i }));
    await userEvent.click(screen.getByRole("button", { name: /claim winning hand/i }));

    expect(onConfirm).toHaveBeenCalledWith("pin-5-0");
  });

  it("shows the empty-state message when no station tile matches a wait", () => {
    render(
      <ClaimWinModal
        atStation={atStation}
        waits={[wait("dragon", 1, 0)]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText("No tile at this station completes your hand."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /claim winning hand/i }),
    ).toBeDisabled();
  });

  it("labels the confirm button 'Yakuman' for yakuman waits", () => {
    render(
      <ClaimWinModal
        atStation={atStation}
        waits={[
          wait("pin", 5, 0, {
            han: 13,
            fu: 0,
            points: 32000,
            isYakuman: true,
            yaku: [{ name: "Daisangen", han: 13 }],
          }),
        ]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Yakuman — locked")).toBeInTheDocument();
  });

  it("disables the confirm button while pending", () => {
    render(
      <ClaimWinModal
        atStation={atStation}
        waits={[wait("pin", 5, 0)]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        pending
      />,
    );

    const button = screen.getByRole("button", { name: /claiming/i });
    expect(button).toBeDisabled();
  });
});
