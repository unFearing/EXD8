const fs = require("node:fs");
const path = require("node:path");

const source = path.resolve(__dirname, "../../app/public/mechs_config.json");
const targets = [
  path.resolve(__dirname, "../dist/mechs_config.json"),
];

if (!fs.existsSync(source)) {
  console.warn(`[copyMechsConfig] Source file not found: ${source}`);
  process.exit(0);
}

for (const target of targets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`[copyMechsConfig] Copied ${source} -> ${target}`);
}
