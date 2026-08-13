export const KITLAAN_SKILL_TREE_BASE_URL = "https://kitlaan.gitlab.io/mwoskill2/";

export type SkillTreeTech = "IS" | "Clan";

export function isSkillTreeCode(value: string | undefined): value is string {
  return /^[0-9a-f]{16,256}$/i.test((value ?? "").trim());
}

export function buildSkillTreeUrl(code: string, tech: SkillTreeTech): string {
  const normalizedCode = code.trim().toLowerCase();
  return `${KITLAAN_SKILL_TREE_BASE_URL}#/${tech === "Clan" ? "C" : "I"}/${normalizedCode}`;
}

export function parseSkillTreeUrl(value: string | undefined): { code: string; tech: SkillTreeTech; url: string } | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.origin !== "https://kitlaan.gitlab.io" || url.pathname.replace(/\/+$/, "") !== "/mwoskill2") {
      return null;
    }

    const match = url.hash.match(/^#\/(C|I)\/([0-9a-f]{16,256})$/i);
    if (!match) return null;
    const tech = match[1].toUpperCase() === "C" ? "Clan" : "IS";
    const code = match[2].toLowerCase();
    return { code, tech, url: buildSkillTreeUrl(code, tech) };
  } catch {
    return null;
  }
}

export function normalizeSkillTreeFields(input: {
  skillTreeCode?: string;
  skillTreeUrl?: string;
  skillCode?: string;
  tech?: SkillTreeTech;
}): { skillTreeCode?: string; skillTreeUrl?: string } {
  const parsedUrl = parseSkillTreeUrl(input.skillTreeUrl);
  if (parsedUrl) {
    const tech = input.tech ?? parsedUrl.tech;
    return { skillTreeCode: parsedUrl.code, skillTreeUrl: buildSkillTreeUrl(parsedUrl.code, tech) };
  }

  const candidateCode = [input.skillTreeCode, input.skillCode]
    .map((value) => value?.trim())
    .find((value) => isSkillTreeCode(value));
  if (!candidateCode) return {};

  const code = candidateCode.toLowerCase();
  return {
    skillTreeCode: code,
    skillTreeUrl: buildSkillTreeUrl(code, input.tech ?? "IS"),
  };
}