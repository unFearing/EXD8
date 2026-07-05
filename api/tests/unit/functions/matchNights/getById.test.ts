import { describe, expect, it, vi } from "vitest";

const { getMatchNightByIdMock } = vi.hoisted(() => ({
  getMatchNightByIdMock: vi.fn(),
}));

vi.mock("../../../../src/db/repositories/matchNightRepository.js", () => ({
  getMatchNightById: getMatchNightByIdMock,
}));

import { getMatchNightByIdHandler } from "../../../../src/functions/matchNights/getById.js";

describe("getMatchNightByIdHandler", () => {
  it("returns 404 when doc is missing", async () => {
    getMatchNightByIdMock.mockResolvedValueOnce(null);

    const response = await getMatchNightByIdHandler({
      params: { id: "missing" },
      query: new URLSearchParams({ teamId: "exd8" }),
      headers: new Headers({
        "x-team-id": "exd8",
        "x-user-id": "user-1",
        "x-user-role": "TL",
      }),
    } as never);

    expect(response.status).toBe(404);
  });

  it("returns 200 when doc exists", async () => {
    getMatchNightByIdMock.mockResolvedValueOnce({ id: "match-1", teamId: "exd8" });

    const response = await getMatchNightByIdHandler({
      params: { id: "match-1" },
      query: new URLSearchParams({ teamId: "exd8" }),
      headers: new Headers({
        "x-team-id": "exd8",
        "x-user-id": "user-1",
        "x-user-role": "TL",
      }),
    } as never);

    expect(response.status).toBe(200);
  });

  it("returns 403 when auth context headers are missing", async () => {
    getMatchNightByIdMock.mockResolvedValueOnce(null);

    const response = await getMatchNightByIdHandler({
      params: { id: "missing" },
      query: new URLSearchParams({ teamId: "exd8" }),
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(403);
  });

  it("returns 409 for team mismatch", async () => {
    getMatchNightByIdMock.mockResolvedValueOnce(null);

    const response = await getMatchNightByIdHandler({
      params: { id: "missing" },
      query: new URLSearchParams({ teamId: "exd8" }),
      headers: new Headers({
        "x-team-id": "other-team",
        "x-user-id": "user-1",
        "x-user-role": "TL",
      }),
    } as never);

    expect(response.status).toBe(409);
    expect((response.jsonBody as { error?: { code?: string } }).error?.code).toBe("TEAM_MISMATCH");
  });
});
