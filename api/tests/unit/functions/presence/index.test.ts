import { describe, expect, it, vi } from "vitest";

const { listPresenceMock, upsertPresenceMock } = vi.hoisted(() => ({
  listPresenceMock: vi.fn(),
  upsertPresenceMock: vi.fn(),
}));

vi.mock("../../../../src/db/repositories/presenceRepository.js", () => ({
  listPresence: listPresenceMock,
  upsertPresence: upsertPresenceMock,
}));

import { listPresenceHandler, upsertPresenceHandler } from "../../../../src/functions/presence/index.js";

const pilotHeaders = new Headers({
  "x-team-id": "team-a",
  "x-user-id": "pilot-1",
  "x-user-name": "Pilot One",
  "x-user-role": "Pilot",
  "x-user-avatar": "trusted-avatar",
});

describe("presence handlers", () => {
  it.each(["TL", "Pilot"] as const)("lists only the authenticated user's team presence for %s", async (role) => {
    listPresenceMock.mockResolvedValueOnce([]);
    const headers = new Headers(pilotHeaders);
    headers.set("x-user-role", role);

    const response = await listPresenceHandler({ headers } as never);

    expect(response.status).toBe(200);
    expect(listPresenceMock).toHaveBeenCalledWith("team-a");
  });

  it("allows Pilot heartbeats and strips client-supplied identity fields", async () => {
    upsertPresenceMock.mockResolvedValueOnce({ id: "presence:pilot-1" });

    const response = await upsertPresenceHandler({
      headers: pilotHeaders,
      json: async () => ({
        view: "decks",
        route: "/",
        status: "active",
        focus: "Deck list",
        userId: "attacker",
        userName: "Spoofed",
        role: "TL",
        avatar: "spoofed-avatar",
        teamId: "team-b",
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(upsertPresenceMock).toHaveBeenCalledWith({
      view: "decks",
      route: "/",
      status: "active",
      focus: "Deck list",
    }, {
      teamId: "team-a",
      userId: "pilot-1",
      userName: "Pilot One",
      role: "Pilot",
      avatar: "trusted-avatar",
    });
  });

  it("rejects unauthenticated reads and malformed updates", async () => {
    const readResponse = await listPresenceHandler({ headers: new Headers() } as never);
    const updateResponse = await upsertPresenceHandler({
      headers: pilotHeaders,
      json: async () => ({ view: "private", route: "", status: "active" }),
    } as never);

    expect(readResponse.status).toBe(403);
    expect(updateResponse.status).toBe(400);
  });

  it("authenticates before parsing and reports invalid JSON as a bad request", async () => {
    const unauthenticatedJson = vi.fn();
    const unauthenticatedResponse = await upsertPresenceHandler({
      headers: new Headers(),
      json: unauthenticatedJson,
    } as never);
    const invalidJsonResponse = await upsertPresenceHandler({
      headers: pilotHeaders,
      json: async () => { throw new SyntaxError("invalid JSON"); },
    } as never);

    expect(unauthenticatedResponse.status).toBe(403);
    expect(unauthenticatedJson).not.toHaveBeenCalled();
    expect(invalidJsonResponse.status).toBe(400);
  });
});