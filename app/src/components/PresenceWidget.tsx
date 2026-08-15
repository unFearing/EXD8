import { Avatar, AvatarGroup, Badge, Box, Tooltip, useMediaQuery, useTheme } from "@mui/material";
import type { PresenceDoc } from "../types/contracts";

type PresenceWidgetProps = {
  presence: PresenceDoc[];
};

function avatarUrl(entry: PresenceDoc): string | undefined {
  return entry.avatar
    ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(entry.userId)}/${encodeURIComponent(entry.avatar)}.png?size=64`
    : undefined;
}

function initials(userName: string): string {
  return userName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function presenceLabel(entry: PresenceDoc): string {
  const view = entry.view === "decks" ? "Drop Decks" : `${entry.view[0]?.toUpperCase()}${entry.view.slice(1)}`;
  return [entry.userName, entry.role, entry.status, view, entry.focus].filter(Boolean).join(" | ");
}

export function PresenceWidget({ presence }: PresenceWidgetProps) {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down("sm"));
  const maxAvatars = isNarrow ? 3 : 5;
  const displayPresence = import.meta.env.DEV && presence.length > 0
    ? [
        ...presence,
        {
          ...presence[0],
          id: "dev-placeholder-pilot",
          userId: "dev-placeholder-pilot",
          userName: "Placeholder Pilot",
          role: "Pilot" as const,
          avatar: undefined,
          status: "active" as const,
          focus: "Previewing collaborative presence",
        },
      ]
    : presence;
  const visibleAvatarCount = Math.min(displayPresence.length, maxAvatars);
  const overlapWidth = isNarrow ? 12 : 16;

  if (!presence.length) return null;

  return (
    <Box
      data-testid="presence-widget"
      sx={{
        display: "flex",
        flexShrink: 0,
        overflow: "visible",
        pl: `${2 + Math.max(0, visibleAvatarCount - 1) * overlapWidth}px`,
        pr: 0.25,
      }}
    >
      <AvatarGroup
        max={maxAvatars}
        spacing="small"
        sx={{
          "& .MuiAvatar-root": {
            width: { xs: 26, sm: 30 },
            height: { xs: 26, sm: 30 },
            fontSize: "0.72rem",
            borderWidth: 1,
          },
        }}
      >
        {displayPresence.map((entry) => (
          <Tooltip key={entry.id} title={presenceLabel(entry)} arrow>
            <Badge
              overlap="circular"
              variant="dot"
              color={entry.status === "active" ? "success" : "warning"}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              aria-label={presenceLabel(entry)}
            >
              <Avatar src={avatarUrl(entry)} alt={entry.userName}>{initials(entry.userName)}</Avatar>
            </Badge>
          </Tooltip>
        ))}
      </AvatarGroup>
    </Box>
  );
}