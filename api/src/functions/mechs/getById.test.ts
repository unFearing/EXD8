import { describe, expect, it, vi } from "vitest";

const { getMechByIdMock } = vi.hoisted(() => ({
  getMechByIdMock: vi.fn(),
}));

vi.mock("../../db/repositories/mechRepository.js", () => ({
  getMechById: getMechByIdMock,
}));

import { getMechByIdHandler } from "./getById.js";

describe("getMechByIdHandler", () => {
  it("returns 404 when doc is missing", async () => {
    getMechByIdMock.mockResolvedValueOnce(null);

    const response = await getMechByIdHandler({
      params: { id: "missing" },
      headers: new Headers({
        "x-team-id": "exd8",
        "x-user-id": "user-1",
        "x-user-role": "TL",
      }),
    } as never);

    expect(response.status).toBe(404);
  });

  it("returns 200 when doc exists", async () => {
    getMechByIdMock.mockResolvedValueOnce({ id: "mech-1" });

    const response = await getMechByIdHandler({
      params: { id: "mech-1" },
      headers: new Headers({
        "x-team-id": "exd8",
        "x-user-id": "user-1",
        "x-user-role": "TL",
      }),
    } as never);

    expect(response.status).toBe(200);
  });

  it("returns 403 when auth context headers are missing", async () => {
    getMechByIdMock.mockResolvedValueOnce(null);

    const response = await getMechByIdHandler({
      params: { id: "missing" },
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(403);
  });

  it("returns 400 when id is missing", async () => {
    const response = await getMechByIdHandler({
      params: {},
      headers: new Headers({
        "x-team-id": "exd8",
        "x-user-id": "user-1",
        "x-user-role": "TL",
      }),
    } as never);

    expect(response.status).toBe(400);
    expect((response.jsonBody as { error?: { code?: string } }).error?.code).toBe("BAD_REQUEST");
  });
});