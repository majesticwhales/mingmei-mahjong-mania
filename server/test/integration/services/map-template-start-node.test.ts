import { beforeEach, describe, expect, it } from "vitest";
import { HttpError } from "../../../src/lib/http-error.ts";
import { MapTemplate } from "../../../src/models/map-template.ts";
import {
  assertStartNodeCodeOnTemplate,
} from "../../../src/services/map-template-start-node.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

describe("assertStartNodeCodeOnTemplate", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("accepts a station code on the seeded TTC 2026 template", async () => {
    const template = await MapTemplate.findOne({ where: { name: "TTC 2026" } });
    expect(template).not.toBeNull();

    await expect(
      assertStartNodeCodeOnTemplate(template!.id, "bay"),
    ).resolves.toBeUndefined();
  });

  it("rejects unknown station codes", async () => {
    const template = await MapTemplate.findOne({ where: { name: "TTC 2026" } });
    expect(template).not.toBeNull();

    await expect(
      assertStartNodeCodeOnTemplate(template!.id, "not-a-station"),
    ).rejects.toMatchObject({
      status: 400,
      code: "validation_error",
    } satisfies Partial<HttpError>);
  });
});
