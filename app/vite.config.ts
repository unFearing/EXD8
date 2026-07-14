import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

function getAppVersion(): string {
  const packageJsonPath = new URL("./package.json", import.meta.url);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { version?: string };
  return packageJson.version ?? "0.0.0";
}

function getBuildInfo(): string {
  const appVersion = getAppVersion();
  let gitHash = "unknown";
  try {
    gitHash = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    // Keep a usable build string even outside git metadata.
  }
  return `v${appVersion} • ${gitHash} • ${new Date().toISOString()}`;
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
    __APP_BUILD_EPOCH_MS__: Date.now(),
    __APP_BUILD_INFO__: JSON.stringify(getBuildInfo()),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7071',
        changeOrigin: true,
      },
    },
  },
})
