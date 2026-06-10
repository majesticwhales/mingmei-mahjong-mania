// SERVER SOURCE: server/src/projections/game-state.ts, recent-events.ts

export type GameStatus = "active" | "ending" | "ended";

export interface TileDto {
  instanceId: string;
  suit: string;
  rank: number;
  copyIndex: number;
  displayName: string;
  isRedFive: boolean;
}

export interface SlotTileDto {
  slotIndex: number;
  tile: TileDto;
}

export interface MapNodeDto {
  id: string;
  code: string;
  name: string;
  coordinateX: number;
  coordinateY: number;
  lineIds: string[];
  labelAnchor: string;
  labelRotate: number | null;
  isInterchange: boolean;
  latitude: number;
  longitude: number;
  tile?: TileDto;
  tiles?: SlotTileDto[];
}

export interface MapLineDto {
  code: string;
  name: string | null;
  shortName: string | null;
  color: string | null;
  sortOrder: number;
  renderMetadata: Record<string, unknown> | null;
}

export interface MapEdgeDto {
  fromNodeId: string;
  toNodeId: string;
}

export interface AtStationDto {
  nodeId: string;
  code: string;
  tile?: TileDto;
  tiles?: SlotTileDto[];
}

export interface HandTileDto extends TileDto {
  slotIndex: number;
}

export interface RecentEventDto {
  sequence: number;
  type: string;
  teamCode: string | null;
  at: string;
  nodeCode?: string;
  slotIndex?: number;
  hasPhoto?: boolean;
  geolocationWarning?: boolean;
  phase?: number;
  template?: string;
}

export interface GameStateProjection {
  gameId: string;
  status: GameStatus;
  endsAt: string;
  nextVisibilityChangeAt: string | null;
  visibilityPhase: number;
  visibilityPhaseCount: number;
  phaseDrivenSlotMap: boolean;
  mapNodes: MapNodeDto[];
  mapLines: MapLineDto[];
  mapEdges: MapEdgeDto[];
  atStation: AtStationDto | null;
  handTiles: HandTileDto[];
  recentEvents: RecentEventDto[];
  roundWind: number;
  seatWind: number;
  doraIndicator: TileDto | null;
  handAnalysis?: Record<string, unknown>;
}
