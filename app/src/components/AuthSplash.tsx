import { Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import type { AuthState } from "../hooks/useDiscordAuth";

interface AuthSplashProps {
  state: AuthState;
  onLogin: () => void;
}

export function AuthSplash({ state, onLogin }: AuthSplashProps) {
  const isLight = localStorage.getItem("ui-theme-mode") !== "dark";

  if (state.isAuthed) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isLight
          ? "radial-gradient(circle at 8% 10%, rgba(132, 154, 184, 0.22), transparent 35%), radial-gradient(circle at 90% 0%, rgba(170, 179, 191, 0.22), transparent 40%), #e3e9f0"
          : "radial-gradient(circle at 8% 10%, rgba(167, 196, 255, 0.18), transparent 35%), radial-gradient(circle at 90% 0%, rgba(119, 140, 191, 0.18), transparent 40%), #0c101d",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
      }}
    >
      <Stack
        spacing={3}
        sx={{
          textAlign: "center",
          maxWidth: 420,
          p: 3,
        }}
      >
        <Stack spacing={0.5}>
          <Typography
            sx={{
              fontSize: "2.5rem",
              fontWeight: 700,
              color: isLight ? "#2f3e58" : "#eff5ff",
              letterSpacing: "-0.5px",
            }}
          >
            EXD8
          </Typography>
          <Typography
            sx={{
              fontSize: "0.95rem",
              color: isLight ? "#556987" : "#cbd6f6",
            }}
          >
            Mech Drop Deck Planner
          </Typography>
        </Stack>

        <Typography
          sx={{
            fontSize: "1rem",
            color: isLight ? "#4f6282" : "#d3ddfc",
            lineHeight: 1.5,
          }}
        >
          Sign in with Discord to access your team's deck planning tools. You must be a member of the team's Discord server.
        </Typography>

        {state.isLoading ? (
          <Stack spacing={1} sx={{ alignItems: "center", py: 2 }}>
            <CircularProgress size={40} />
            <Typography
              sx={{
                fontSize: "0.9rem",
                color: isLight ? "#556987" : "#cbd6f6",
              }}
            >
              {state.error ? "Auth failed, try again" : "Connecting..."}
            </Typography>
          </Stack>
        ) : (
          <Button
            variant="contained"
            size="large"
            onClick={onLogin}
            disabled={state.isLoading}
            sx={{
              backgroundColor: "#5865F2",
              color: "#fff",
              textTransform: "none",
              fontWeight: 600,
              fontSize: "1rem",
              py: 1.5,
              "&:hover": { backgroundColor: "#4752C4" },
              transition: "all 200ms ease",
            }}
          >
            Sign in with Discord
          </Button>
        )}

        {state.error && (
          <Typography
            sx={{
              fontSize: "0.85rem",
              color: "#f44336",
            }}
          >
            {state.error}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
