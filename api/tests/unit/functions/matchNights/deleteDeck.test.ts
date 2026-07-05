import { describe, expect, it, vi } from "vitest";

const { deleteDropDeckByIdMock } = vi.hoisted(() => ({
  deleteDropDeckByIdMock: vi.fn(),
}));

vi.mock("../../../../src/db/repositories/matchNightRepository.js", () => ({
  deleteDropDeckById: deleteDropDeckByIdMock,
}));

vi.mock("../../../../src/middleware/authGuard.js", () => ({
  getRequestContext: (request: { headers: Headers }) => {
    const role = request.headers.get("x-user-role");
    const teamId = request.headers.get("x-team-id");
    const userId = request.headers.get("x-user-id");

    if (!teamId || !userId || !role) {
      throw new Error("MISSING_AUTH_CONTEXT");
    }

    if (role !== "TL" && role !== "Pilot") {
      throw new Error("INVALID_ROLE");
    }

    if (role === "Pilot") {
      throw new Error("FORBIDDEN_WRITE");
    }

    return { teamId, role, userId };
  },
  assertCanWrite: (ctx: { role: string }) => {
    if (ctx.role !== "TL") {
      throw new Error("FORBIDDEN_WRITE");
    }
  },
}));

import { deleteDropDeckHandler } from "../../../../src/functions/matchNights/deleteDeck.js";

describe("deleteDropDeckHandler", () => {
  it("returns 200 when deck is successfully deleted", async () => {
    deleteDropDeckByIdMock.mockResolvedValueOnce(true);

    const response = await deleteDropDeckHandler({
      params: { id: "deck-123" },
      headers: new Headers({
        "x-user-role": "TL",
        "x-team-id": "exd8",
        "x-user-id": "user-1",
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(response.jsonBody).toEqual({
      ok: true,
      data: { id: "deck-123", deleted: true },
    });
  });

  it("returns 404 when deck is not found", async () => {
    deleteDropDeckByIdMock.mockResolvedValueOnce(false);

    const response = await deleteDropDeckHandler({
      params: { id: "missing-deck" },
      headers: new Headers({
        "x-user-role": "TL",
        "x-team-id": "exd8",
        "x-user-id": "user-1",
      }),
    } as never);

    expect(response.status).toBe(404);
    expect((response.jsonBody as { error?: { code?: string } }).error?.code).toBe("NOT_FOUND");
  });

  it("returns 403 when user is not TL", async () => {
    const response = await deleteDropDeckHandler({
      params: { id: "deck-123" },
      headers: new Headers({
        "x-user-role": "Pilot",
        "x-team-id": "exd8",
        "x-user-id": "user-1",
      }),
    } as never);

    expect(response.status).toBe(403);
    expect((response.jsonBody as { error?: { code?: string } }).error?.code).toBe("FORBIDDEN");
  });

  it("returns 403 when auth context headers are missing", async () => {
    const response = await deleteDropDeckHandler({
      params: { id: "deck-123" },
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(403);
    expect((response.jsonBody as { error?: { code?: string } }).error?.code).toBe("FORBIDDEN");
  });

  it("returns 400 when deck id is missing", async () => {
    const response = await deleteDropDeckHandler({
      params: {},
      headers: new Headers({
        "x-user-role": "TL",
        "x-team-id": "exd8",
        "x-user-id": "user-1",
      }),
    } as never);

    expect(response.status).toBe(400);
    expect((response.jsonBody as { error?: { code?: string } }).error?.code).toBe("BAD_REQUEST");
  });
});
