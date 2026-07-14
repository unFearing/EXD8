import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseMechBuildHandler } from "../functions/mechs/parseBuild.js";

type ParseResult = {
  url: string;
  status: number;
  body: unknown;
  outputFile: string;
};

const TEST_LINKS = [
  "https://mwo.nav-alpha.com/mechlab?b=76dc0101_FLE-R5K",
  "https://mwo.nav-alpha.com/mechlab?b=d8c1976d_FMT-AL",
  "https://mwo.nav-alpha.com/mechlab?b=f56719e6_LCT-3V",
  "https://mwo.nav-alpha.com/mechlab?b=34312eda_EXE-PRIME",
  "https://mwo.nav-alpha.com/mechlab?b=135b84bd_ON1-IIC-SK",
  "https://mwo.nav-alpha.com/mechlab?b=20e83334_BSK-5",
  "https://mwo.nav-alpha.com/mechlab?b=2ff4bed0_UM-IIC-MTSP",
  "https://mwo.nav-alpha.com/mechlab?b=00fd907b_BSK-M",
];

function sanitizeName(rawUrl: string): string {
  const token = new URL(rawUrl).searchParams.get("b") ?? "unknown";
  return token.replace(/[^A-Za-z0-9._-]/g, "_");
}

async function parseLink(url: string): Promise<{ status: number; body: unknown }> {
  const request = {
    json: async () => ({ url }),
  };

  const response = await parseMechBuildHandler(request as never);
  return {
    status: response.status ?? 500,
    body: response.jsonBody ?? null,
  };
}

async function main(): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = resolve(process.cwd(), "tmp", `parse-link-tests-${timestamp}`);
  await mkdir(outputDir, { recursive: true });

  const results: ParseResult[] = [];

  for (const url of TEST_LINKS) {
    const parsed = await parseLink(url);
    const fileName = `${sanitizeName(url)}.json`;
    const outputFile = resolve(outputDir, fileName);
    await writeFile(
      outputFile,
      `${JSON.stringify({ url, status: parsed.status, response: parsed.body }, null, 2)}\n`,
      "utf8",
    );

    results.push({
      url,
      status: parsed.status,
      body: parsed.body,
      outputFile,
    });

    console.log(`[${parsed.status}] ${url}`);
  }

  const summaryFile = resolve(outputDir, "summary.json");
  await writeFile(
    summaryFile,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        outputDir,
        total: results.length,
        statuses: results.map((result) => ({ url: result.url, status: result.status, outputFile: result.outputFile })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`Output directory: ${outputDir}`);
  console.log(`Summary file: ${summaryFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
