import type { RecentEventDto } from "../wire/projection";

export interface FormatEventMessageOptions {
  /** Fallback station names keyed by node code for older event rows. */
  stationNamesByCode?: Readonly<Record<string, string>>;
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function formatTeamLabel(teamCode: string | null | undefined): string {
  if (!teamCode) return "A team";
  return `Team ${titleCase(teamCode)}`;
}

function slotNumber(slotIndex: number): number {
  return slotIndex + 1;
}

function formatVisibilityPhaseUnlock(event: RecentEventDto): string {
  if (event.phase == null) {
    return "Visibility phase unlocked — additional station tiles are now visible";
  }

  const phaseNumber = event.phase + 1;
  if (event.visibilityPhaseCount != null) {
    return `Phase ${phaseNumber} of ${event.visibilityPhaseCount} unlocked — additional station tiles are now visible`;
  }
  return `Phase ${phaseNumber} unlocked — additional station tiles are now visible`;
}

function formatSlotClaimUnlock(slotIndex: number): string {
  return `Station slot ${slotNumber(slotIndex)} unlocked for tile claims`;
}

function formatSlotMapUnlock(slotIndex: number): string {
  return `Station slot ${slotNumber(slotIndex)} revealed on the map`;
}

function stationLabel(
  event: RecentEventDto,
  stationNamesByCode?: Readonly<Record<string, string>>,
): string {
  if (event.nodeName) return event.nodeName;
  if (event.nodeCode && stationNamesByCode?.[event.nodeCode]) {
    return stationNamesByCode[event.nodeCode];
  }
  if (event.nodeCode) return titleCase(event.nodeCode);
  return "a station";
}

export function formatEventMessage(
  event: RecentEventDto,
  options: FormatEventMessageOptions = {},
): string {
  const team = formatTeamLabel(event.teamCode);
  const station = stationLabel(event, options.stationNamesByCode);

  switch (event.type) {
    case "CHECK_IN":
      return `${team} checked in at ${station}`;
    case "CHECK_OUT":
      return `${team} checked out from ${station}`;
    case "SWAP_TILE":
      if (event.handTileDisplayName && event.stationTileDisplayName) {
        return `${team} swapped ${event.handTileDisplayName} for ${event.stationTileDisplayName} at ${station}`;
      }
      return `${team} swapped tiles at ${station}`;
    case "CLAIM_WIN":
      if (event.finalPoints != null) {
        return `${team} claimed win at ${station} (${event.finalPoints.toLocaleString()} points)`;
      }
      if (event.stationTileDisplayName) {
        return `${team} claimed win with ${event.stationTileDisplayName} at ${station}`;
      }
      return `${team} claimed win at ${station}`;
    case "START_CHALLENGE":
      return `${team} started a challenge at ${station}`;
    case "CHALLENGE_COMPLETED":
      return `${team} completed a challenge at ${station}`;
    case "CHALLENGE_FORFEITED":
      return `${team} abandoned a challenge at ${station}`;
    case "SLOT_UNLOCKED":
      return event.slotIndex != null
        ? formatSlotClaimUnlock(event.slotIndex)
        : "A station slot unlocked for tile claims";
    case "SLOT_MAP_UNLOCKED":
      return event.slotIndex != null
        ? formatSlotMapUnlock(event.slotIndex)
        : "A station slot was revealed on the map";
    case "VISIBILITY_PHASE_ADVANCED":
      return formatVisibilityPhaseUnlock(event);
    case "NOTIFICATION":
      return event.template ? `Notification: ${event.template}` : "Notification";
    case "GAME_ENDED":
      return "Game ended";
    case "SCORES_REVEALED":
      return "Scores revealed";
    default:
      return event.type.replace(/_/g, " ").toLowerCase();
  }
}
