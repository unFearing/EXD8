import { afterEach, describe, expect, it, vi } from "vitest";

import { parseMechBuildHandler } from "../../../../src/functions/mechs/parseBuild.js";

const originalFetch = global.fetch;

const requestFor = (buildToken: string) => ({
  json: async () => ({ url: `https://mwo.nav-alpha.com/mechlab?b=${buildToken}` }),
  headers: new Headers({ "x-team-id": "EXD8", "x-user-id": "pilot-1", "x-user-role": "Pilot" }),
}) as never;

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
});

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

  it("stores an HTML fallback export code as default", async () => {
    const fallbackCode = "AHTML12345678901234567890";

    global.fetch = vi.fn(async (url: string) => {
      const value = String(url);
      if (value.startsWith("https://mwo.nav-alpha.com/api/build/")) {
        throw new Error("Public API unavailable");
      }
      if (value.startsWith("https://r.jina.ai/http://")) {
        throw new Error("Rendered source unavailable");
      }
      return new Response(`Weapon: Magshot\nBuild Code: ${fallbackCode}`, { status: 200 });
    }) as never;

    const response = await parseMechBuildHandler(requestFor("5eb157b1_FS9-FS"));
    const body = response.jsonBody as {
      data?: { draft?: { buildCodes?: Record<string, string> }; warnings?: string[] };
    };

    expect(body.data?.draft?.buildCodes).toMatchObject({ default: fallbackCode });
    expect(body.data?.draft?.buildCodes?.export).toBeUndefined();
    expect(body.data?.warnings).not.toEqual(expect.arrayContaining([expect.stringContaining("paste it manually")]));
  });

  it("preserves a rendered export code when the API returns a lower-priority code", async () => {
    const renderedCode = "ARENDERED1234567890123456";
    const apiCode = "AAPI123456789012345678901";
    vi.stubEnv("NAV_ALPHA_API_KEY", "test-key");

    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const value = String(url);
      const authorization = new Headers(init?.headers).get("authorization");
      if (value.startsWith("https://mwo.nav-alpha.com/api/build/") && authorization?.startsWith("Native ")) {
        throw new Error("Public API unavailable");
      }
      if (value.startsWith("https://r.jina.ai/http://")) {
        return new Response(`Heat Sink ${renderedCode}`, { status: 200 });
      }
      if (value.startsWith("https://mwo.nav-alpha.com/api/build/") && authorization === "Bearer test-key") {
        return Response.json({
          ok: true,
          data: [{ build_code: apiCode }],
        });
      }
      throw new Error(`Unexpected fetch: ${value}`);
    }) as never;

    const response = await parseMechBuildHandler(requestFor("5eb157b1_FS9-FS"));
    const body = response.jsonBody as { data?: { draft?: { buildCodes?: Record<string, string> } } };

    expect(body.data?.draft?.buildCodes?.default).toBe(renderedCode);
    expect(body.data?.draft?.buildCodes?.default).not.toBe(apiCode);
    expect(body.data?.draft?.buildCodes?.export).toBeUndefined();
  });

  it("uses an API export code when rendered data has a loadout but no code", async () => {
    const apiCode = "AAPI123456789012345678901";
    vi.stubEnv("NAV_ALPHA_API_KEY", "test-key");

    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const value = String(url);
      const authorization = new Headers(init?.headers).get("authorization");
      if (value.startsWith("https://mwo.nav-alpha.com/api/build/") && authorization?.startsWith("Native ")) {
        throw new Error("Public API unavailable");
      }
      if (value.startsWith("https://r.jina.ai/http://")) {
        return new Response("Magshot\nHeat Sinks: 10", { status: 200 });
      }
      if (value.startsWith("https://mwo.nav-alpha.com/api/build/") && authorization === "Bearer test-key") {
        return Response.json({
          ok: true,
          data: [{ item_type: "weapon", short_name: "Medium Laser", build_code: apiCode }],
        });
      }
      throw new Error(`Unexpected fetch: ${value}`);
    }) as never;

    const response = await parseMechBuildHandler(requestFor("5eb157b1_FS9-FS"));
    const body = response.jsonBody as {
      data?: { draft?: { weaponry?: string; buildCodes?: Record<string, string> }; warnings?: string[] };
    };

    expect(body.data?.draft?.weaponry).toContain("Magshot");
    expect(body.data?.draft?.buildCodes?.default).toBe(apiCode);
    expect(body.data?.draft?.buildCodes?.export).toBeUndefined();
    expect(body.data?.warnings).not.toEqual(expect.arrayContaining([expect.stringContaining("paste it manually")]));
  });

  it("warns for manual entry when no source returns an export code", async () => {
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).startsWith("https://mwo.nav-alpha.com/api/build/")) {
        throw new Error("Public API unavailable");
      }
      if (String(url).startsWith("https://r.jina.ai/http://")) {
        throw new Error("Rendered source unavailable");
      }
      return new Response("No build details available", { status: 200 });
    }) as never;

    const response = await parseMechBuildHandler(requestFor("5eb157b1_FS9-FS"));
    const body = response.jsonBody as {
      data?: { draft?: { buildCodes?: Record<string, string> }; warnings?: string[] };
    };

    expect(body.data?.draft?.buildCodes?.default).toBeUndefined();
    expect(body.data?.draft?.buildCodes?.export).toBeUndefined();
    expect(body.data?.warnings).toEqual(expect.arrayContaining([expect.stringContaining("paste it manually")]));
  });
});
