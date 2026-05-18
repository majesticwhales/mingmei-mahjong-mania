import { Router } from "express";
import {
  listMapTemplates,
  loadDefaultMapTemplate,
  loadMapTemplateById,
} from "../services/map-template-network.ts";

export const mapTemplatesRouter = Router();

mapTemplatesRouter.get("/", async (_req, res, next) => {
  try {
    const templates = await listMapTemplates();
    res.json({ templates });
  } catch (err) {
    next(err);
  }
});

mapTemplatesRouter.get("/:id/network", async (req, res, next) => {
  try {
    const network = await loadMapTemplateById(req.params.id);
    if (!network) {
      res.status(404).json({ error: "Map template not found" });
      return;
    }
    res.json(network);
  } catch (err) {
    next(err);
  }
});

export async function getDefaultNetwork(
  _req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
) {
  try {
    const network = await loadDefaultMapTemplate();
    if (!network) {
      res.status(404).json({
        error: "No map template seeded. Run npm run db:seed from the repo root.",
      });
      return;
    }
    res.json(network);
  } catch (err) {
    next(err);
  }
}
