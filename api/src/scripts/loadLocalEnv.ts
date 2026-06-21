import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let loaded = false;

function stripQuotes(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

export function loadLocalEnv(): void {
  if (loaded) {
    return;
  }

  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    loaded = true;
    return;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator < 1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = stripQuotes(trimmed.slice(separator + 1).trim());

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  loaded = true;
}

loadLocalEnv();
