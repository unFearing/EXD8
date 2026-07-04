import { app, type HttpRequest, type InvocationContext, type Timer } from "@azure/functions";
import type { DropDeckDoc, MechDoc } from "../../types/contracts.js";
import { listDropDecks } from "../../db/repositories/matchNightRepository.js";
import { listMechs } from "../../db/repositories/mechRepository.js";
import { assertCanWrite, getRequestContext } from "../../middleware/authGuard.js";
import { fail, ok } from "../../middleware/http.js";

type DiscordMessageResponse = {
  id: string;
};

type BackupRunResult = {
  messageId: string;
  generatedAt: string;
  counts: {
    decks: number;
    mechs: number;
  };
};

const DISCORD_API_BASE = "https://discord.com/api/v10";

function stripCosmosFields<T extends { _rid?: string; _self?: string; _etag?: string; _attachments?: string; _ts?: number }>(
  value: T,
): Omit<T, "_rid" | "_self" | "_etag" | "_attachments" | "_ts"> {
  const {
    _rid: _unusedRid,
    _self: _unusedSelf,
    _etag: _unusedEtag,
    _attachments: _unusedAttachments,
    _ts: _unusedTs,
    ...rest
  } = value;
  return rest;
}

function isDeckSlotFilled(slot: DropDeckDoc["deck"][number]): boolean {
  return Boolean(
    slot.mech?.trim()
      || slot.chassis?.trim()
      || slot.variant?.trim()
      || slot.buildUrl?.trim(),
  );
}

function sanitizeDecksForBackup(decks: DropDeckDoc[]): Array<Omit<DropDeckDoc, "_rid" | "_self" | "_etag" | "_attachments" | "_ts">> {
  return decks
    .filter((deck) => deck.deck.filter(isDeckSlotFilled).length >= 5)
    .map((deck) => stripCosmosFields(deck));
}

function sanitizeMechsForBackup(mechs: MechDoc[]): Array<Omit<MechDoc, "_rid" | "_self" | "_etag" | "_attachments" | "_ts">> {
  return mechs.map((mech) => stripCosmosFields(mech));
}

async function postBackupToDiscord(channelId: string, botToken: string, payload: unknown): Promise<DiscordMessageResponse> {
  const fileName = `exd8-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const bodyText = JSON.stringify(payload, null, 2);

  const form = new FormData();
  form.append(
    "payload_json",
    JSON.stringify({
      content: `EXD8 daily backup: ${new Date().toISOString()}`,
    }),
  );
  form.append("files[0]", new Blob([bodyText], { type: "application/json" }), fileName);

  const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Discord backup post failed (${response.status}): ${detail}`);
  }

  return (await response.json()) as DiscordMessageResponse;
}

async function runDiscordBackup(): Promise<BackupRunResult> {
  const channelId = process.env.DISCORD_BACKUP_CHANNEL_ID?.trim();
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();

  if (!channelId || !botToken) {
    throw new Error("MISSING_DISCORD_BACKUP_CONFIG");
  }

  const [decks, mechs] = await Promise.all([listDropDecks(), listMechs()]);
  const backupDecks = sanitizeDecksForBackup(decks);
  const backupMechs = sanitizeMechsForBackup(mechs);
  const generatedAt = new Date().toISOString();

  const payload = {
    generatedAt,
    app: "EXD8",
    counts: {
      decks: backupDecks.length,
      mechs: backupMechs.length,
    },
    decks: backupDecks,
    mechs: backupMechs,
  };

  const result = await postBackupToDiscord(channelId, botToken, payload);

  return {
    messageId: result.id,
    generatedAt,
    counts: {
      decks: backupDecks.length,
      mechs: backupMechs.length,
    },
  };
}

export async function dailyDiscordBackupHandler(_timer: Timer, context: InvocationContext): Promise<void> {
  try {
    const result = await runDiscordBackup();
    context.log(`Daily Discord backup posted. messageId=${result.messageId}`);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "MISSING_DISCORD_BACKUP_CONFIG") {
      context.log("Skipping daily backup: DISCORD_BACKUP_CHANNEL_ID or DISCORD_BOT_TOKEN missing");
      return;
    }
    throw error;
  }
}

if (process.env.ENABLE_DAILY_BACKUP_TIMER === "true") {
  app.timer("dailyDiscordBackup", {
    // 11:00 UTC daily by default; override with BACKUP_CRON_UTC
    schedule: process.env.BACKUP_CRON_UTC || "0 0 11 * * *",
    handler: dailyDiscordBackupHandler,
  });
}

export async function manualDiscordBackupHandler(request: HttpRequest) {
  try {
    const ctx = getRequestContext(request);
    assertCanWrite(ctx);

    const result = await runDiscordBackup();
    return ok(result);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "MISSING_AUTH_CONTEXT") {
      return fail(403, "FORBIDDEN", "Missing auth context headers");
    }
    if (error instanceof Error && error.message === "INVALID_ROLE") {
      return fail(403, "FORBIDDEN", "Invalid user role header");
    }
    if (error instanceof Error && error.message === "FORBIDDEN_WRITE") {
      return fail(403, "FORBIDDEN", "Write permission denied");
    }
    if (error instanceof Error && error.message === "MISSING_DISCORD_BACKUP_CONFIG") {
      return fail(500, "INTERNAL", "Missing Discord backup configuration");
    }

    return fail(500, "INTERNAL", "Unexpected server error");
  }
}

app.http("manualDiscordBackup", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "backups/discord/manual",
  handler: manualDiscordBackupHandler,
});
