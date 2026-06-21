import { spawn } from "node:child_process";
import "./loadLocalEnv.js";

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function runSync(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "sync:all"], {
      cwd: process.cwd(),
      stdio: "inherit",
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Sync failed with exit code ${code}`));
      } else {
        resolve();
      }
    });

    child.on("error", reject);
  });
}

async function watchSync(): Promise<void> {
  console.log(`Starting watch mode. Syncing every ${SYNC_INTERVAL_MS / 1000 / 60} minutes...`);

  // Run initial sync
  try {
    await runSync();
    console.log(`[${new Date().toISOString()}] Sync completed.`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Sync failed:`, error);
  }

  // Schedule periodic syncs
  setInterval(async () => {
    try {
      console.log(`[${new Date().toISOString()}] Running scheduled sync...`);
      await runSync();
      console.log(`[${new Date().toISOString()}] Sync completed.`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Sync failed:`, error);
    }
  }, SYNC_INTERVAL_MS);

  // Keep process alive
  console.log("Press Ctrl+C to stop watching.");
  await new Promise(() => {
    // Never resolves; process stays alive
  });
}

watchSync().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
