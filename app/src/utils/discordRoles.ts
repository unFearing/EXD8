export type AppRole = "TL" | "Pilot";

const APP_TL_ROLE_ID = import.meta.env.VITE_DISCORD_ROLE_TL ?? "";
const APP_PILOT_ROLE_ID = import.meta.env.VITE_DISCORD_ROLE_PILOT ?? "";

export type DiscordUserLike = {
  id: string;
  username?: string;
  roles?: string[];
  appRole?: AppRole;
};

export function resolveAppRole(roles: string[], appRole?: AppRole): AppRole | null {
  if (appRole === "TL" || appRole === "Pilot") {
    return appRole;
  }

  if (APP_TL_ROLE_ID && roles.includes(APP_TL_ROLE_ID)) {
    return "TL";
  }

  if (APP_PILOT_ROLE_ID && roles.includes(APP_PILOT_ROLE_ID)) {
    return "Pilot";
  }

  return null;
}

export function normalizeDiscordUser<T extends DiscordUserLike>(user: T): T & { appRole: AppRole } {
  const resolvedRole = resolveAppRole(user.roles ?? [], user.appRole);
  return {
    ...user,
    appRole: resolvedRole ?? "Pilot",
  };
}
