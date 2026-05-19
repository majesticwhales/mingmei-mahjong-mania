import { describe, expect, it } from "vitest";
import { getAgent } from "../../setup/http.ts";

describe("map template catalog", () => {
  it("lists seeded templates", async () => {
    const agent = await getAgent();
    const res = await agent.get("/api/map-templates");

    expect(res.status).toBe(200);
    expect(res.body.templates.length).toBeGreaterThanOrEqual(1);

    const ttc = res.body.templates.find(
      (t: { name: string }) => t.name === "TTC 2026",
    );
    expect(ttc).toBeDefined();
    expect(ttc.nodeCount).toBe(84);
  });

  it("returns network JSON for a template", async () => {
    const agent = await getAgent();
    const list = await agent.get("/api/map-templates");
    const templateId = list.body.templates[0].id as string;

    const res = await agent.get(`/api/map-templates/${templateId}/network`);

    expect(res.status).toBe(200);
    expect(res.body.template.nodeCount).toBe(84);
    expect(res.body.stations.length).toBe(84);
    expect(res.body.lines.length).toBeGreaterThan(0);
  });

  it("returns the default network at /api/network", async () => {
    const agent = await getAgent();
    const res = await agent.get("/api/network");

    expect(res.status).toBe(200);
    expect(res.body.template.name).toBe("TTC 2026");
    expect(res.body.stations.length).toBe(84);
  });
});
