#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const bumpPart = process.argv[2] ?? "patch";
const packageJsonPath = resolve(process.cwd(), "app", "package.json");

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const version = String(packageJson.version ?? "0.0.0");
const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);

if (!match) {
  console.error(`Unsupported version format: ${version}`);
  process.exit(1);
}

const major = Number(match[1]);
const minor = Number(match[2]);
const patch = Number(match[3]);

let nextVersion;
if (bumpPart === "minor") {
  nextVersion = `${major}.${minor + 1}.0`;
} else if (bumpPart === "major") {
  nextVersion = `${major + 1}.0.0`;
} else {
  nextVersion = `${major}.${minor}.${patch + 1}`;
}

packageJson.version = nextVersion;
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
process.stdout.write(nextVersion);
