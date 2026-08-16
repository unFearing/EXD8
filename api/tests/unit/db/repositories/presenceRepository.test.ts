import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchAllMock, queryMock, upsertMock } = vi.hoisted(() => {
  const fetchAll = vi.fn();
  return {
    fetchAllMock: fetchAll,
    queryMock: vi.fn(() => ({ fetchAll })),
    upsertMock: vi.fn(),
  };
});

vi.mock("../../../../src/db/cosmos.js", () => ({
  getMatchNightsContainer: () => ({
    items: {
      query: queryMock,
      upsert: upsertMock,
    },
  }),
}));

import { listPresence, upsertPresence } from "../../../../src/db/repositories/presenceRepository.js";

describe("presence repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAllMock.mockResolvedValue({ resources: [] });
    upsertMock.mockResolvedValue({});
  });

  it("upserts a deterministic, team-partitioned document with trusted identity and logical expiry", async () => {
    const now = new Date("2026-08-14T12:00:00.000Z");

    const result = await upsertPresence({
      view: "overview",
      route: "/overview",
      status: "active",
      focus: "Map overview",
    }, {
      teamId: "team-a",
      role: "Pilot",
      userId: "discord-42",
      userName: "Pilot One",
      avatar: "avatar-hash",
    }, now);

    expect(result).toMatchObject({
      id: "presence:discord-42",
      comp: "presence:team-a",
      teamId: "team-a",
      userId: "discord-42",
      userName: "Pilot One",
      role: "Pilot",
      avatar: "avatar-hash",
      updatedAt: "2026-08-14T12:00:00.000Z",
      expiresAt: "2026-08-14T12:01:30.000Z",
      ttl: 90,
    });
    expect(upsertMock).toHaveBeenCalledWith(result);
  });

  it("queries the team comp and filters expired documents authoritatively", async () => {
    const now = new Date("2026-08-14T12:00:00.000Z");
    const current = {
      id: "presence:user-1",
      comp: "presence:team-a",
      teamId: "team-a",
      userId: "user-1",
      userName: "Pilot One",
      role: "Pilot",
      view: "decks",
      route: "/",
      status: "active",
      updatedAt: "2026-08-14T12:00:00.000Z",
      expiresAt: "2026-08-14T12:00:01.000Z",
      schemaVersion: "1.0.0",
      docType: "presence",
      _etag: "cosmos-metadata-is-stripped",
    };
    const expired = { ...current, id: "presence:user-2", expiresAt: "2026-08-14T12:00:00.000Z" };
    const malformed = { ...current, id: "presence:user-3", status: "unknown" };
    fetchAllMock.mockResolvedValueOnce({ resources: [current, expired, malformed] });

    const { _etag, ...publicPresence } = current;
    await expect(listPresence("team-a", now)).resolves.toEqual([publicPresence]);
    expect(queryMock).toHaveBeenCalledWith(expect.objectContaining({
      parameters: expect.arrayContaining([
        { name: "@comp", value: "presence:team-a" },
        { name: "@now", value: "2026-08-14T12:00:00.000Z" },
      ]),
    }));
  });
});