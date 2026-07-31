import { describe, expect, it, vi } from "vitest";

import { parseMechBuildHandler } from "../../../../src/functions/mechs/parseBuild.js";

describe("parseMechBuildHandler", () => {
  it.each([
    ["4d5427ea_MAD-X", "MAD-X"],
    ["efb3b5c3_MAD-XS", "MAD-XS"],
  ])("resolves %s as a Marauder II", async (buildToken, expectedVariant) => {
    global.fetch = vi.fn(async () => {
      throw new Error("Network unavailable");
    }) as never;

    const response = await parseMechBuildHandler({
      json: async () => ({
        url: `https://mwo.nav-alpha.com/mechlab?b=${buildToken}`,
      }),
      headers: new Headers(),
    } as never);

    expect(response.status).toBe(200);
    const body = response.jsonBody as {
      data?: { draft?: { chassis?: string; variant?: string; tech?: string; tonnage?: number } };
    };
    expect(body.data?.draft).toMatchObject({
      chassis: "Marauder Ii",
      variant: expectedVariant,
      tech: "IS",
      tonnage: 100,
    });
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
      headers: new Headers(),
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