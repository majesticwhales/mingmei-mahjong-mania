import { Router } from "express";
import type { TeamAssignmentMode } from "../models/lobby.ts";
import { asyncHandler } from "../middleware/async-handler.ts";
import { HttpError } from "../lib/http-error.ts";
import { startFromLobby } from "../services/game-start-service.ts";
import * as lobbyService from "../services/lobby-service.ts";
import * as notificationService from "../services/lobby-notification-service.ts";

export const lobbiesRouter = Router();

function parseOptionalString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "validation_error", "Expected a string value");
  }
  return value;
}

function parseOptionalNullableStartNodeCode(
  value: unknown,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(
      400,
      "validation_error",
      "defaultStartNodeCode must be a non-empty station code or null",
    );
  }
  return value;
}

function parseOptionalPositiveInt(
  value: unknown,
  fieldName: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new HttpError(
      400,
      "validation_error",
      `${fieldName} must be a positive integer`,
    );
  }
  return value;
}

function parseTeamAssignmentMode(value: unknown): TeamAssignmentMode | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== "pick" && value !== "random" && value !== "mixed") {
    throw new HttpError(
      400,
      "validation_error",
      "teamAssignmentMode must be pick, random, or mixed",
    );
  }
  return value;
}

function parseRequiredNonNegativeInt(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new HttpError(
      400,
      "validation_error",
      `${fieldName} must be a non-negative integer`,
    );
  }
  return value;
}

function parseOptionalNonNegativeInt(
  value: unknown,
  fieldName: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parseRequiredNonNegativeInt(value, fieldName);
}

function parseRequiredTemplate(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "validation_error", "template must be a string");
  }
  return value;
}

function parseOptionalTemplate(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parseRequiredTemplate(value);
}

function parseOptionalNullableData(
  value: unknown,
): Record<string, unknown> | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new HttpError(
      400,
      "validation_error",
      "data must be an object or null",
    );
  }
  return value as Record<string, unknown>;
}

function parseTeamSlot(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(
      400,
      "validation_error",
      "teamSlot must be an integer 1–4, or null for random assignment",
    );
  }
  return value;
}

lobbiesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const lobby = await lobbyService.createLobby(req.user!.id, {
      mapTemplateId: parseOptionalString(body.mapTemplateId),
      gameDurationSeconds: parseOptionalPositiveInt(
        body.gameDurationSeconds,
        "gameDurationSeconds",
      ),
      visibilityPhaseIntervalSeconds: parseOptionalPositiveInt(
        body.visibilityPhaseIntervalSeconds,
        "visibilityPhaseIntervalSeconds",
      ),
      visibilityPhaseCount: parseOptionalPositiveInt(
        body.visibilityPhaseCount,
        "visibilityPhaseCount",
      ),
      slotsPerNode: parseOptionalPositiveInt(
        body.slotsPerNode,
        "slotsPerNode",
      ),
      teamAssignmentMode: parseTeamAssignmentMode(body.teamAssignmentMode),
      minPlayersToStart: parseOptionalPositiveInt(
        body.minPlayersToStart,
        "minPlayersToStart",
      ),
      defaultStartNodeCode: parseOptionalNullableStartNodeCode(
        body.defaultStartNodeCode,
      ),
    });
    res.status(201).json({ lobby });
  }),
);

lobbiesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const lobby = await lobbyService.getLobbyForUser(req.params.id, req.user!.id);
    res.json({ lobby });
  }),
);

lobbiesRouter.patch(
  "/:id/config",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const lobby = await lobbyService.updateConfig(
      req.params.id,
      req.user!.id,
      {
        mapTemplateId: parseOptionalString(body.mapTemplateId),
        gameDurationSeconds: parseOptionalPositiveInt(
          body.gameDurationSeconds,
          "gameDurationSeconds",
        ),
        visibilityPhaseIntervalSeconds: parseOptionalPositiveInt(
          body.visibilityPhaseIntervalSeconds,
          "visibilityPhaseIntervalSeconds",
        ),
        visibilityPhaseCount: parseOptionalPositiveInt(
          body.visibilityPhaseCount,
          "visibilityPhaseCount",
        ),
        slotsPerNode: parseOptionalPositiveInt(
          body.slotsPerNode,
          "slotsPerNode",
        ),
        teamAssignmentMode: parseTeamAssignmentMode(body.teamAssignmentMode),
        minPlayersToStart: parseOptionalPositiveInt(
          body.minPlayersToStart,
          "minPlayersToStart",
        ),
        defaultStartNodeCode: parseOptionalNullableStartNodeCode(
          body.defaultStartNodeCode,
        ),
      },
    );
    res.json({ lobby });
  }),
);

lobbiesRouter.post(
  "/:id/join",
  asyncHandler(async (req, res) => {
    const lobby = await lobbyService.joinLobby(req.params.id, req.user!.id);
    res.json({ lobby });
  }),
);

lobbiesRouter.post(
  "/:id/team",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    if (!("teamSlot" in body)) {
      throw new HttpError(400, "validation_error", "teamSlot is required");
    }
    const lobby = await lobbyService.pickTeam(
      req.params.id,
      req.user!.id,
      parseTeamSlot(body.teamSlot),
    );
    res.json({ lobby });
  }),
);

lobbiesRouter.post(
  "/:id/start",
  asyncHandler(async (req, res) => {
    const result = await startFromLobby(req.params.id, req.user!.id);
    res.status(201).json(result);
  }),
);

lobbiesRouter.get(
  "/:id/notifications",
  asyncHandler(async (req, res) => {
    const notifications = await notificationService.listLobbyNotifications(
      req.params.id,
      req.user!.id,
    );
    res.json({ notifications });
  }),
);

lobbiesRouter.post(
  "/:id/notifications",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const notification = await notificationService.addLobbyNotification(
      req.params.id,
      req.user!.id,
      {
        atSeconds: parseRequiredNonNegativeInt(body.atSeconds, "atSeconds"),
        template: parseRequiredTemplate(body.template),
        data: parseOptionalNullableData(body.data),
      },
    );
    res.status(201).json({ notification });
  }),
);

lobbiesRouter.patch(
  "/:id/notifications/:notifId",
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const patch: Parameters<typeof notificationService.updateLobbyNotification>[3] = {};
    const atSeconds = parseOptionalNonNegativeInt(body.atSeconds, "atSeconds");
    if (atSeconds !== undefined) {
      patch.atSeconds = atSeconds;
    }
    const template = parseOptionalTemplate(body.template);
    if (template !== undefined) {
      patch.template = template;
    }
    if (Object.prototype.hasOwnProperty.call(body, "data")) {
      patch.data = parseOptionalNullableData(body.data);
    }
    const notification = await notificationService.updateLobbyNotification(
      req.params.id,
      req.user!.id,
      req.params.notifId,
      patch,
    );
    res.json({ notification });
  }),
);

lobbiesRouter.delete(
  "/:id/notifications/:notifId",
  asyncHandler(async (req, res) => {
    await notificationService.removeLobbyNotification(
      req.params.id,
      req.user!.id,
      req.params.notifId,
    );
    res.status(204).send();
  }),
);
