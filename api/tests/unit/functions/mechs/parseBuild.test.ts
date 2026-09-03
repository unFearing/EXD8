import { describe, expect, it, vi } from "vitest";

import { parseMechBuildHandler } from "../../../../src/functions/mechs/parseBuild.js";

describe("parseMechBuildHandler", () => {
  it.each([
    ["4d5427ea_MAD-X", "Marauder Ii", "MAD-X", "IS", 100, "Assault"],
    ["efb3b5c3_MAD-XS", "Marauder Ii", "MAD-X(S)", "IS", 100, "Assault"],
    ["4d5427ea_MAD-BH2", "Marauder", "BOUNTY HUNTER II", "IS", 75, "Heavy"],
    ["4d5427ea_MAD-4A", "Marauder Ii", "MAD-4A", "IS", 100, "Assault"],
    ["4d5427ea_MAD-IIC", "Marauder Iic", "MAD-IIC", "Clan", 85, "Assault"],
  ])("resolves Marauder URL variant %s", async (buildToken, chassis, variant, tech, tonnage, className) => {
    global.fetch = vi.fn(async () => {
      throw new Error("Network unavailable");
    }) as never;

    const response = await parseMechBuildHandler({
      json: async () => ({
        url: `https://mwo.nav-alpha.com/mechlab?b=${buildToken}`,
      }),
      headers: new Headers({ "x-team-id": "EXD8", "x-user-id": "pilot-1", "x-user-role": "Pilot" }),
    } as never);

    expect(response.status).toBe(200);
    const body = response.jsonBody as {
      data?: { draft?: { chassis?: string; variant?: string; tech?: string; tonnage?: number; class?: string } };
    };
    expect(body.data?.draft).toMatchObject({
      chassis,
      variant,
      tech,
      tonnage,
      class: className,
    });
  });

  it.each([
    ["4d5427ea_MAD-ZZZ", "MAD", "MAD-ZZZ", "matches multiple known chassis families"],
    ["4d5427ea_ZZZ-1", "ZZZ", "ZZZ-1", "No mechs_config chassis mapping found"],
  ])("keeps fallback import available for unresolved URL variant %s", async (buildToken, chassis, variant, warning) => {
    global.fetch = vi.fn(async () => {
      throw new Error("Network unavailable");
    }) as never;

    const response = await parseMechBuildHandler({
      json: async () => ({ url: `https://mwo.nav-alpha.com/mechlab?b=${buildToken}` }),
      headers: new Headers({ "x-team-id": "EXD8", "x-user-id": "pilot-1", "x-user-role": "Pilot" }),
    } as never);

    expect(response.status).toBe(200);
    const body = response.jsonBody as {
      data?: { draft?: { chassis?: string; variant?: string; tonnage?: number }; warnings?: string[] };
    };
    expect(body.data?.draft).toMatchObject({ chassis, variant, tonnage: 50 });
    expect(body.data?.warnings).toEqual(expect.arrayContaining([expect.stringContaining(warning)]));
  });

  it("detects Magshot weapons from rendered mechlab builds", async () => {
    const renderedText = `
FS9-FS
Magshot
Magshot
Magshot
Magshot
  Build Code: A123456789012345678901
Heat Sinks: 10
`;

    global.fetch = vi.fn(async (url: string) => {
      if (String(url).startsWith("https://r.jina.ai/http://")) {
        return new Response(renderedText, { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as never;

    const response = await parseMechBuildHandler({
      json: async () => ({
        url: "https://mwo.nav-alpha.com/mechlab?b=5eb157b1_FS9-FS",
      }),
      headers: new Headers({ "x-team-id": "EXD8", "x-user-id": "pilot-1", "x-user-role": "Pilot" }),
    } as never);

    expect(response.status).toBe(200);
    const body = response.jsonBody as {
      ok?: boolean;
      data?: { draft?: { weaponry?: string; buildCodes?: Record<string, string> } };
    };
    expect(body.ok).toBe(true);
    expect(body.data?.draft?.weaponry).toContain("Magshot");
    expect(body.data?.draft?.buildCodes?.default).toBe("A123456789012345678901");
    expect(body.data?.draft?.buildCodes?.export).toBeUndefined();
  });
});
