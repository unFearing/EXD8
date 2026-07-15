import { describe, expect, it, vi } from "vitest";

import { parseMechBuildHandler } from "../../../../src/functions/mechs/parseBuild.js";

describe("parseMechBuildHandler", () => {
  it("detects Magshot weapons from rendered mechlab builds", async () => {
    const renderedText = `
FS9-FS
Magshot
Magshot
Magshot
Magshot
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
    const body = response.jsonBody as { ok?: boolean; data?: { draft?: { weaponry?: string } } };
    expect(body.ok).toBe(true);
    expect(body.data?.draft?.weaponry).toContain("Magshot");
  });
});