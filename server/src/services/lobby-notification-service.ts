import { HttpError } from "../lib/http-error.ts";
import { Lobby } from "../models/lobby.ts";
import { LobbyMember } from "../models/lobby-member.ts";
import { LobbyNotification } from "../models/lobby-notification.ts";
import { getBroadcaster } from "../socket/broadcaster-registry.ts";

export interface LobbyNotificationDto {
  id: string;
  atSeconds: number;
  template: string;
  data: Record<string, unknown> | null;
}

export interface AddLobbyNotificationInput {
  atSeconds: number;
  template: string;
  data?: Record<string, unknown> | null;
}

export interface UpdateLobbyNotificationPatch {
  atSeconds?: number;
  template?: string;
  data?: Record<string, unknown> | null;
}

const TEMPLATE_MAX_LENGTH = 64;

function serialize(notification: LobbyNotification): LobbyNotificationDto {
  return {
    id: notification.id,
    atSeconds: notification.atSeconds,
    template: notification.template,
    data: notification.data,
  };
}

/**
 * Public alias of the local `serialize`. Used by `lobby-service` when
 * folding notifications into the lobby detail DTO, so the wire shape
 * stays in lock-step with the dedicated `/notifications` endpoint.
 */
export function serializeLobbyNotification(
  notification: LobbyNotification,
): LobbyNotificationDto {
  return serialize(notification);
}

function validateAtSeconds(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new HttpError(
      400,
      "validation_error",
      "atSeconds must be a non-negative integer",
    );
  }
}

function validateTemplate(value: string): void {
  if (typeof value !== "string") {
    throw new HttpError(400, "validation_error", "template must be a string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new HttpError(400, "validation_error", "template must be non-empty");
  }
  if (trimmed.length > TEMPLATE_MAX_LENGTH) {
    throw new HttpError(
      400,
      "validation_error",
      `template must be at most ${TEMPLATE_MAX_LENGTH} characters`,
    );
  }
}

async function loadLobbyHostOnlyWaiting(
  lobbyId: string,
  hostUserId: string,
): Promise<Lobby> {
  const lobby = await Lobby.findByPk(lobbyId);
  if (!lobby) {
    throw new HttpError(404, "not_found", "Lobby not found");
  }
  if (lobby.hostUserId !== hostUserId) {
    throw new HttpError(
      403,
      "forbidden",
      "Only the host can manage lobby notifications",
    );
  }
  if (lobby.status !== "waiting") {
    throw new HttpError(
      409,
      "lobby_not_waiting",
      `Lobby is not accepting changes (status: ${lobby.status})`,
    );
  }
  return lobby;
}

async function loadLobbyMemberOnly(
  lobbyId: string,
  userId: string,
): Promise<Lobby> {
  const lobby = await Lobby.findByPk(lobbyId);
  if (!lobby) {
    throw new HttpError(404, "not_found", "Lobby not found");
  }
  const member = await LobbyMember.findOne({
    where: { lobbyId, userId },
  });
  if (!member) {
    throw new HttpError(403, "forbidden", "You are not a member of this lobby");
  }
  return lobby;
}

/**
 * List notifications scheduled for a lobby. Any member can view; CRUD
 * operations remain host-only.
 */
export async function listLobbyNotifications(
  lobbyId: string,
  userId: string,
): Promise<LobbyNotificationDto[]> {
  await loadLobbyMemberOnly(lobbyId, userId);
  const rows = await LobbyNotification.findAll({
    where: { lobbyId },
    order: [
      ["atSeconds", "ASC"],
      ["createdAt", "ASC"],
    ],
  });
  return rows.map(serialize);
}

export async function addLobbyNotification(
  lobbyId: string,
  hostUserId: string,
  input: AddLobbyNotificationInput,
): Promise<LobbyNotificationDto> {
  validateAtSeconds(input.atSeconds);
  validateTemplate(input.template);

  await loadLobbyHostOnlyWaiting(lobbyId, hostUserId);

  const created = await LobbyNotification.create({
    lobbyId,
    atSeconds: input.atSeconds,
    template: input.template.trim(),
    data: input.data ?? null,
  });
  await getBroadcaster().emitLobbyConfig(lobbyId);
  return serialize(created);
}

export async function updateLobbyNotification(
  lobbyId: string,
  hostUserId: string,
  notificationId: string,
  patch: UpdateLobbyNotificationPatch,
): Promise<LobbyNotificationDto> {
  if (patch.atSeconds !== undefined) {
    validateAtSeconds(patch.atSeconds);
  }
  if (patch.template !== undefined) {
    validateTemplate(patch.template);
  }

  await loadLobbyHostOnlyWaiting(lobbyId, hostUserId);

  const notification = await LobbyNotification.findOne({
    where: { id: notificationId, lobbyId },
  });
  if (!notification) {
    throw new HttpError(404, "not_found", "Notification not found");
  }

  if (patch.atSeconds !== undefined) {
    notification.atSeconds = patch.atSeconds;
  }
  if (patch.template !== undefined) {
    notification.template = patch.template.trim();
  }
  if (patch.data !== undefined) {
    notification.data = patch.data;
  }

  await notification.save();
  await getBroadcaster().emitLobbyConfig(lobbyId);
  return serialize(notification);
}

export async function removeLobbyNotification(
  lobbyId: string,
  hostUserId: string,
  notificationId: string,
): Promise<void> {
  await loadLobbyHostOnlyWaiting(lobbyId, hostUserId);

  const deleted = await LobbyNotification.destroy({
    where: { id: notificationId, lobbyId },
  });
  if (deleted === 0) {
    throw new HttpError(404, "not_found", "Notification not found");
  }
  await getBroadcaster().emitLobbyConfig(lobbyId);
}
