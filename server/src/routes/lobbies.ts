import { Router } from "express";
import type { TeamAssignmentMode } from "../models/lobby.ts";
import { asyncHandler } from "../middleware/async-handler.ts";
import { HttpError } from "../lib/http-error.ts";
import * as lobbyService from "../services/lobby-service.ts";

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
      teamAssignmentMode: parseTeamAssignmentMode(body.teamAssignmentMode),
      minPlayersToStart: parseOptionalPositiveInt(
        body.minPlayersToStart,
        "minPlayersToStart",
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
        teamAssignmentMode: parseTeamAssignmentMode(body.teamAssignmentMode),
        minPlayersToStart: parseOptionalPositiveInt(
          body.minPlayersToStart,
          "minPlayersToStart",
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
