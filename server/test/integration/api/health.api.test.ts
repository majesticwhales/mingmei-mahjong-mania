import { describe, expect, it } from "vitest";
import { getAgent } from "../../setup/http.ts";

describe("GET /api/health", () => {
  it("returns ok when the database is reachable", async () => {
    const agent = await getAgent();
    const res = await agent.get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "connected" });
  });
});
