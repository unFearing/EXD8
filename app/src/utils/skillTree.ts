import type { MechDoc } from "../types/contracts";

const KITLAAN_SKILL_TREE_BASE_URL = "https://kitlaan.gitlab.io/mwoskill2/";

export function isSkillTreeCode(value: string | undefined): value is string {
  return /^[0-9a-f]{16,256}$/i.test((value ?? "").trim());
}

export function buildSkillTreeUrl(code: string, tech: "IS" | "Clan"): string {
  return `${KITLAAN_SKILL_TREE_BASE_URL}#/${tech === "Clan" ? "C" : "I"}/${code.trim().toLowerCase()}`;
}

export function parseSkillTreeUrl(value: string | undefined): { code: string; tech: "IS" | "Clan"; url: string } | null {
  try {
    const url = new URL((value ?? "").trim());
    const match = url.hash.match(/^#\/(C|I)\/([0-9a-f]{16,256})$/i);
    if (url.origin !== "https://kitlaan.gitlab.io" || url.pathname.replace(/\/+$/, "") !== "/mwoskill2" || !match) return null;
    const tech = match[1].toUpperCase() === "C" ? "Clan" : "IS";
    const code = match[2].toLowerCase();
    return { code, tech, url: buildSkillTreeUrl(code, tech) };
  } catch {
    return null;
  }
}

export function normalizeSkillTreeInput(
  value: string,
  tech: "IS" | "Clan",
): { code: string; url: string; tech: "IS" | "Clan" } | null {
  const parsedUrl = parseSkillTreeUrl(value);
  if (parsedUrl) {
    return { code: parsedUrl.code, url: parsedUrl.url, tech: parsedUrl.tech };
  }

  const code = value.trim();
  if (!isSkillTreeCode(code)) return null;
  return { code: code.toLowerCase(), url: buildSkillTreeUrl(code, tech), tech };
}

export function getMechSkillTreeCode(mech: MechDoc | undefined): string {
  return (mech?.skillTreeCode || mech?.skillCode || "").trim();
}