import { HttpError } from "../lib/http-error.ts";
import { MapTemplateNode } from "../models/map-template-node.ts";

export function normalizeStartNodeCode(code: string): string {
  return code.trim().toLowerCase();
}

export async function assertStartNodeCodeOnTemplate(
  mapTemplateId: string,
  nodeCode: string,
): Promise<void> {
  const normalized = normalizeStartNodeCode(nodeCode);
  const node = await MapTemplateNode.findOne({
    where: { mapTemplateId, code: normalized },
  });
  if (!node) {
    throw new HttpError(
      400,
      "validation_error",
      `Unknown station code "${nodeCode}" on this map template`,
    );
  }
}
