import request, { type Test } from "supertest";
import type { Express } from "express";

export async function getApp(): Promise<Express> {
  const { app } = await import("../../src/app.ts");
  return app;
}

export async function getAgent() {
  const app = await getApp();
  return request(app);
}

export type ApiAgent = Awaited<ReturnType<typeof getAgent>>;

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export type AuthedRequest = Test;
