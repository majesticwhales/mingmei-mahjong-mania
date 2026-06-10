import type { AuthResponse, LoginRequest, MeResponse, RegisterRequest } from "../wire/auth";
import type { GameCommandAcked } from "../wire/command";
import type { HttpErrorBody } from "../wire/error";
import type {
  CreateLobbyInput,
  LobbyConfigPatch,
  LobbyDetailDto,
  LobbyNotificationDto,
  MapTemplateSummary,
  StartLobbyResponse,
} from "../wire/lobby";
import type { GameSummaryDto } from "../wire/summary";
import { HttpError } from "./httpError";

const AUTH_STORAGE_KEY = "mmm.auth.v1";

export type TokenProvider = () => string | null;

let tokenProvider: TokenProvider = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string };
    return typeof parsed.token === "string" ? parsed.token : null;
  } catch {
    return null;
  }
};

export function setTokenProvider(provider: TokenProvider) {
  tokenProvider = provider;
}

function getBaseUrl() {
  return "";
}

async function parseErrorResponse(res: Response): Promise<HttpError> {
  const status = res.status;
  try {
    const body = (await res.json()) as HttpErrorBody;
    const code = typeof body.error === "string" ? body.error : "unknown_error";
    const message =
      typeof body.message === "string" ? body.message : res.statusText || "Request failed";
    return new HttpError(code, message, status, body.details);
  } catch {
    return new HttpError("unknown_error", res.statusText || "Request failed", status);
  }
}

interface RequestOptions {
  method: string;
  path: string;
  body?: unknown;
  token?: string | null;
  auth?: boolean;
}

async function request<T>(options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const token =
    options.token !== undefined
      ? options.token
      : options.auth !== false
        ? tokenProvider()
        : null;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${options.path}`, {
      method: options.method,
      headers,
      body,
    });
  } catch {
    throw new HttpError("network_error", "Network request failed", 0);
  }
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export const restClient = {
  register(input: RegisterRequest) {
    return request<AuthResponse>({
      method: "POST",
      path: "/api/auth/register",
      body: input,
      auth: false,
    });
  },
  login(input: LoginRequest) {
    return request<AuthResponse>({
      method: "POST",
      path: "/api/auth/login",
      body: input,
      auth: false,
    });
  },
  getMe(token?: string | null) {
    return request<MeResponse>({
      method: "GET",
      path: "/api/auth/me",
      token,
    });
  },
  listMapTemplates() {
    return request<{ templates: MapTemplateSummary[] }>({
      method: "GET",
      path: "/api/map-templates",
    });
  },
  createLobby(input: CreateLobbyInput = {}) {
    return request<{ lobby: LobbyDetailDto }>({
      method: "POST",
      path: "/api/lobbies",
      body: input,
    });
  },
  getLobby(id: string) {
    return request<{ lobby: LobbyDetailDto }>({
      method: "GET",
      path: `/api/lobbies/${id}`,
    });
  },
  updateLobbyConfig(id: string, patch: LobbyConfigPatch) {
    return request<{ lobby: LobbyDetailDto }>({
      method: "PATCH",
      path: `/api/lobbies/${id}/config`,
      body: patch,
    });
  },
  joinLobby(id: string) {
    return request<{ lobby: LobbyDetailDto }>({
      method: "POST",
      path: `/api/lobbies/${id}/join`,
      body: {},
    });
  },
  pickTeam(id: string, teamSlot: number | null) {
    return request<{ lobby: LobbyDetailDto }>({
      method: "POST",
      path: `/api/lobbies/${id}/team`,
      body: { teamSlot },
    });
  },
  startLobby(id: string) {
    return request<StartLobbyResponse>({
      method: "POST",
      path: `/api/lobbies/${id}/start`,
      body: {},
    });
  },
  addNotification(
    id: string,
    input: { atSeconds: number; template: string; data?: Record<string, unknown> | null },
  ) {
    return request<{ notification: LobbyNotificationDto }>({
      method: "POST",
      path: `/api/lobbies/${id}/notifications`,
      body: input,
    });
  },
  updateNotification(
    id: string,
    notifId: string,
    patch: Partial<{ atSeconds: number; template: string; data: Record<string, unknown> | null }>,
  ) {
    return request<{ notification: LobbyNotificationDto }>({
      method: "PATCH",
      path: `/api/lobbies/${id}/notifications/${notifId}`,
      body: patch,
    });
  },
  deleteNotification(id: string, notifId: string) {
    return request<void>({
      method: "DELETE",
      path: `/api/lobbies/${id}/notifications/${notifId}`,
    });
  },
  submitCommand(
    gameId: string,
    body: {
      gameTeamId: string;
      commandType: string;
      payload?: Record<string, unknown>;
      clientCommandId: string;
    },
  ) {
    return request<GameCommandAcked>({
      method: "POST",
      path: `/api/games/${gameId}/commands`,
      body,
    });
  },
  endGame(gameId: string) {
    return request<{ status: "ended" }>({
      method: "POST",
      path: `/api/games/${gameId}/end`,
      body: {},
    });
  },
  getGameSummary(gameId: string) {
    return request<GameSummaryDto>({
      method: "GET",
      path: `/api/games/${gameId}/summary`,
    });
  },
};

export { AUTH_STORAGE_KEY };
