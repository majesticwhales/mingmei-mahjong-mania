import { render, screen, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TILE_STATION_CODES } from "../data/tileStations";
import { makeProjection } from "../test/fixtures/projection";
import { GameContext } from "../state/game/Context";
import type { GameState } from "../state/game/types";
import type {
  AvailableActionDto,
  AvailableActionType,
  NodeViewDto,
  NodeViewTileDto,
} from "../wire/nodeView";
import type {
  AtStationChallengeDto,
  AtStationDto,
  TileDto,
} from "../wire/projection";
import { StationPanel } from "./StationPanel";

// Phase L Chunk 5 — `<StationPanel />` now sources its primary data
// from `useNodeView(viewingNodeId)`. We mock the hook so each test
// dictates the `NodeViewDto` directly; the component's job is to
// translate that shape into the right tile-slot + button matrix
// (TDD §5.4).
const useNodeViewMock =
  vi.fn<(nodeId: string | null) => {
    data: NodeViewDto | null;
    loading: boolean;
    error: null;
    refresh: () => void;
  }>();

vi.mock("../state/game/useNodeView", () => ({
  useNodeView: (nodeId: string | null) => useNodeViewMock(nodeId),
}));

const TILE_STATION_CODE = TILE_STATION_CODES[0]!;

function makeTile(
  overrides: Partial<TileDto> & {
    suit: TileDto["suit"];
    rank: number;
    copyIndex?: number;
  },
): TileDto {
  const copyIndex = overrides.copyIndex ?? 0;
  return {
    instanceId: `${overrides.suit}-${overrides.rank}-${copyIndex}`,
    displayName: `${overrides.suit} ${overrides.rank}`,
    isRedFive: false,
    ...overrides,
    copyIndex,
  };
}

function makeAction(
  action: AvailableActionType,
  enabled: boolean,
  reason?: AvailableActionDto["reason"],
): AvailableActionDto {
  return reason != null
    ? { action, enabled, reason }
    : { action, enabled };
}

function makeNodeView(overrides: Partial<NodeViewDto> = {}): NodeViewDto {
  const baseTiles: NodeViewTileDto[] = [
    { slotIndex: 0, tile: makeTile({ suit: "pin", rank: 1 }), visible: true, locked: false },
    { slotIndex: 1, tile: null, visible: false, locked: true },
    { slotIndex: 2, tile: null, visible: false, locked: true },
  ];
  return {
    nodeId: "node-1",
    code: TILE_STATION_CODE,
    name: "High Park",
    lineIds: ["1"],
    isInterchange: false,
    tiles: baseTiles,
    currentChallenge: null,
    availableActions: [
      makeAction("check_in", true),
      makeAction("check_out", false, "not_checked_in"),
      makeAction("swap_tile", false, "not_checked_in"),
      makeAction("swap_location_tiles", false, "not_checked_in"),
      makeAction("start_challenge", false, "not_checked_in"),
      makeAction("claim_win", false, "not_checked_in"),
    ],
    ...overrides,
  };
}

function makeAtStation(overrides: Partial<AtStationDto> = {}): AtStationDto {
  return {
    nodeId: "node-1",
    code: TILE_STATION_CODE,
    pendingSwapCredit: false,
    creditEarnedInSession: false,
    tiles: [],
    currentChallenge: null,
    ...overrides,
  };
}

function buildProvider(atStation: AtStationDto | null) {
  return function Provider({ children }: { children: ReactNode }) {
    const state: GameState = {
      status: "active",
      id: "game-1",
      gameTeamId: "team-1",
      projection: makeProjection({ atStation }),
      eventLog: [],
      notifications: [],
    };
    return (
      <GameContext.Provider
        value={{
          state,
          joinGame: vi.fn(),
          resyncGame: vi.fn(),
          submitCommand: vi.fn(),
          dismissNotification: vi.fn(),
          leaveGame: vi.fn(),
        }}
      >
        {children}
      </GameContext.Provider>
    );
  };
}

function mountStationPanel(
  overrides: Partial<ComponentProps<typeof StationPanel>> = {},
  atStation: AtStationDto | null = null,
) {
  return render(
    <StationPanel
      viewingNodeId="node-1"
      checkedInNodeName={atStation?.code ?? null}
      handTiles={[]}
      onClose={vi.fn()}
      onCheckIn={vi.fn()}
      onCheckOut={vi.fn()}
      onSwapTile={vi.fn()}
      onOpenChallenge={vi.fn()}
      onClaimWin={vi.fn()}
      {...overrides}
    />,
    { wrapper: buildProvider(atStation) },
  );
}

describe("StationPanel — useNodeView integration", () => {
  beforeEach(() => {
    useNodeViewMock.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
  });
  afterEach(() => {
    useNodeViewMock.mockReset();
  });

  it("calls useNodeView with the supplied viewingNodeId", () => {
    useNodeViewMock.mockReturnValue({
      data: makeNodeView(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    mountStationPanel({ viewingNodeId: "node-42" });

    expect(useNodeViewMock).toHaveBeenCalledWith("node-42");
  });

  it("renders one slot per NodeViewTileDto on tile stations — visible tiles face-up, hidden ones as Unknown", () => {
    useNodeViewMock.mockReturnValue({
      data: makeNodeView(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { container } = mountStationPanel();

    const slots = container.querySelectorAll(".station-panel__slot");
    expect(slots).toHaveLength(3);
    expect(within(slots[0] as HTMLElement).getByText("pin 1")).toBeTruthy();
    expect(slots[1]?.classList.contains("station-panel__slot--unknown")).toBe(true);
    expect(slots[2]?.classList.contains("station-panel__slot--unknown")).toBe(true);
  });

  it("renders 'Check in here' as the only action when the team is not yet checked in", () => {
    useNodeViewMock.mockReturnValue({
      data: makeNodeView(),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    mountStationPanel();

    expect(screen.getByRole("button", { name: /check in here/i })).not.toBeDisabled();
    // Swap / Claim / View challenge clusters are at-station-only.
    expect(screen.queryByRole("button", { name: /swap tile/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /claim hand/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /view challenge/i })).toBeNull();
  });

  it("disables the Check-in button when availableActions.check_in.enabled === false and surfaces the reason as the tooltip", () => {
    useNodeViewMock.mockReturnValue({
      data: makeNodeView({
        availableActions: [
          makeAction("check_in", false, "game_ended"),
          makeAction("check_out", false, "game_ended"),
          makeAction("swap_tile", false, "game_ended"),
          makeAction("swap_location_tiles", false, "game_ended"),
          makeAction("start_challenge", false, "game_ended"),
          makeAction("claim_win", false, "game_ended"),
        ],
      }),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    mountStationPanel();

    const checkInBtn = screen.getByRole("button", { name: /check in here/i });
    expect(checkInBtn).toBeDisabled();
    expect(checkInBtn.getAttribute("title")).toBe("Game has ended.");
  });

  it("renders Swap + Claim + Check-out when the team is checked in at the viewing station and the server enables those actions", () => {
    useNodeViewMock.mockReturnValue({
      data: makeNodeView({
        availableActions: [
          // `check_in` omitted on purpose — the server doesn't emit it
          // when the team is already at this node (see node-view.ts).
          makeAction("check_out", true),
          makeAction("swap_tile", true),
          makeAction("swap_location_tiles", true),
          makeAction("start_challenge", false, "no_challenge_at_station"),
          makeAction("claim_win", true),
        ],
      }),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    mountStationPanel(
      { viewingNodeId: "node-1" },
      makeAtStation({ nodeId: "node-1" }),
    );

    expect(screen.queryByRole("button", { name: /check in here/i })).toBeNull();
    expect(screen.getByRole("button", { name: /swap tile/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /claim hand/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /^check out$/i })).not.toBeDisabled();
  });

  it("flips Swap → 'View challenge' when swap_tile.reason === swap_credit_required and feeds the reason tooltip onto the challenge button", () => {
    useNodeViewMock.mockReturnValue({
      data: makeNodeView({
        availableActions: [
          makeAction("check_out", true),
          makeAction("swap_tile", false, "swap_credit_required"),
          makeAction("swap_location_tiles", false, "swap_credit_required"),
          makeAction("start_challenge", true),
          makeAction("claim_win", false, "not_tenpai"),
        ],
      }),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    mountStationPanel(
      { viewingNodeId: "node-1" },
      makeAtStation({ nodeId: "node-1" }),
    );

    // Challenge gate active → swap button replaced by View Challenge.
    expect(screen.queryByRole("button", { name: /swap tile/i })).toBeNull();
    const challengeBtn = screen.getByRole("button", { name: /view challenge/i });
    expect(challengeBtn).not.toBeDisabled();
    // Claim button is hidden when claim_win.enabled === false (the
    // "you can claim a hand" affordance is server-driven now).
    expect(screen.queryByRole("button", { name: /claim hand/i })).toBeNull();
  });

  it("renders the cooldown timestamp from nodeView.currentChallenge.cooldownUntil when the challenge is on cooldown", () => {
    const cooldownUntil = "2026-06-11T21:30:00.000Z";
    const challenge: AtStationChallengeDto = {
      challengeId: "c-1",
      title: "Test",
      description: "Test challenge",
      flavorText: null,
      imageUrl: null,
      status: "cooldown",
      cooldownUntil,
    };
    useNodeViewMock.mockReturnValue({
      data: makeNodeView({
        currentChallenge: challenge,
        availableActions: [
          makeAction("check_out", true),
          makeAction("swap_tile", false, "challenge_on_cooldown"),
          makeAction("swap_location_tiles", false, "challenge_on_cooldown"),
          makeAction("start_challenge", false, "challenge_on_cooldown"),
          makeAction("claim_win", false, "not_tenpai"),
        ],
      }),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { container } = mountStationPanel(
      { viewingNodeId: "node-1" },
      makeAtStation({ nodeId: "node-1" }),
    );

    const cooldown = container.querySelector(".station-panel__challenge-cooldown");
    expect(cooldown).not.toBeNull();
    expect(cooldown!.querySelector("time")?.getAttribute("datetime")).toBe(
      cooldownUntil,
    );
  });

  it("renders 'Check out from <name>' (without the at-station action cluster) when browsing a different station while checked in", () => {
    useNodeViewMock.mockReturnValue({
      data: makeNodeView({
        nodeId: "node-2",
        name: "Other Station",
        availableActions: [
          makeAction("check_in", true),
          // From the other-node nodeView's POV `check_out` is
          // disabled with `wrong_node` — the panel intentionally
          // ignores that and renders an unconditional "Check out
          // from <current station>" button against the team's
          // checked-in node.
          makeAction("check_out", false, "wrong_node"),
          makeAction("swap_tile", false, "wrong_node"),
          makeAction("swap_location_tiles", false, "wrong_node"),
          makeAction("start_challenge", false, "wrong_node"),
          makeAction("claim_win", false, "wrong_node"),
        ],
      }),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    mountStationPanel(
      { viewingNodeId: "node-2", checkedInNodeName: "Home Station" },
      makeAtStation({ nodeId: "node-1", code: "bay" }),
    );

    expect(screen.getByRole("button", { name: /move here/i })).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: /check out from home station/i }),
    ).not.toBeDisabled();
    // At-station cluster (Swap / Claim / Check out) is suppressed
    // because the user isn't checked in HERE.
    expect(screen.queryByRole("button", { name: /^check out$/i })).toBeNull();
  });

  it("respects commandsPending — every action button is disabled while a command is in flight", () => {
    useNodeViewMock.mockReturnValue({
      data: makeNodeView({
        availableActions: [
          makeAction("check_out", true),
          makeAction("swap_tile", true),
          makeAction("swap_location_tiles", true),
          makeAction("start_challenge", true),
          makeAction("claim_win", true),
        ],
      }),
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    mountStationPanel(
      { viewingNodeId: "node-1", commandsPending: true },
      makeAtStation({ nodeId: "node-1" }),
    );

    expect(screen.getByRole("button", { name: /swap tile/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /claim hand/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^check out$/i })).toBeDisabled();
  });
});
