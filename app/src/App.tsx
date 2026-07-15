import { Box, CssBaseline, ThemeProvider, Typography, createTheme } from "@mui/material";
import { useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DeckBoard } from "./components/DeckBoard";
import { RepositoryView } from "./components/RepositoryView";
import { AuthSplash } from "./components/AuthSplash";
import { useDiscordAuth } from "./hooks/useDiscordAuth";
import "./App.css";

type ThemeMode = "light" | "dark";
type ViewMode = "view" | "edit";

const APP_BUILD_WATERMARK_RIGHT_PX = 12;
const APP_BUILD_WATERMARK_BOTTOM_PX = 8;
const APP_BUILD_WATERMARK_OPACITY = 0.78;
const APP_BUILD_WATERMARK_FONT_SIZE = "0.88rem";
const APP_BUILD_WATERMARK_FONT_WEIGHT = 700;
const APP_ROLE_TEAM_LEAD = "TL" as const;
const APP_WATERMARK_VERSION = `v${__APP_VERSION__}`;

function formatBuildTimestamp(buildEpochMs: number): string {
  const buildDate = new Date(buildEpochMs);
  if (Number.isNaN(buildDate.getTime())) {
    return "build time unavailable";
  }

  return buildDate.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function buildTheme(mode: ThemeMode) {
  return createTheme({
    palette: {
      mode,
      primary: {
        main: mode === "light" ? "#4f6a95" : "#90caf9",
      },
      secondary: {
        main: mode === "light" ? "#a86f44" : "#ffb74d",
      },
      background: {
        default: mode === "light" ? "#e7edf4" : "#0b1020",
        paper: mode === "light" ? "#edf3f9" : "#131b36",
      },
    },
    shape: {
      borderRadius: 14,
    },
    typography: {
      fontFamily: '"Rajdhani", "IBM Plex Sans", sans-serif',
      h4: {
        fontWeight: 700,
        letterSpacing: 0.5,
      },
      h6: {
        fontWeight: 700,
      },
    },
  });
}

function AppContent() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("ui-theme-mode");
    return stored === "light" || stored === "dark" ? stored : "dark";
  });
  const [viewMode, setViewMode] = useState<ViewMode>("edit");

  const theme = useMemo(() => buildTheme(mode), [mode]);
  const watermarkBuildTimestamp = useMemo(
    () => formatBuildTimestamp(__APP_BUILD_EPOCH_MS__),
    [],
  );
  const auth = useDiscordAuth();
  const bypassDiscordAuth = import.meta.env.VITE_DISABLE_DISCORD_AUTH === "true";

  const effectiveAuth = bypassDiscordAuth
    ? {
        isLoading: false,
        isAuthed: true,
        user: {
          id: "local-dev",
          username: "Local Dev",
          roles: ["local-dev"],
          appRole: APP_ROLE_TEAM_LEAD,
        },
        error: null,
        login: () => {
          // noop in local auth bypass mode
        },
        logout: () => {
          // noop in local auth bypass mode
        },
        hasRole: (_roleId: string) => true,
      }
    : auth;

  const toggleMode = () => {
    setMode((previous) => {
      const next = previous === "dark" ? "light" : "dark";
      localStorage.setItem("ui-theme-mode", next);
      return next;
    });
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {!bypassDiscordAuth && !effectiveAuth.isLoading && !effectiveAuth.isAuthed && (
        <AuthSplash state={effectiveAuth} onLogin={effectiveAuth.login} />
      )}
      {effectiveAuth.isAuthed && (
        <Routes>
          <Route
            path="/"
            element={
              <DeckBoard
                mode={mode}
                onToggleMode={toggleMode}
                user={effectiveAuth.user}
                onLogout={effectiveAuth.logout}
                hasRole={effectiveAuth.hasRole}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
              />
            }
          />
          <Route
            path="/repository"
            element={
              <RepositoryView
                mode={mode}
                onToggleMode={toggleMode}
                user={effectiveAuth.user}
                onLogout={effectiveAuth.logout}
                hasRole={effectiveAuth.hasRole}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
      <Box
        sx={{
          position: "fixed",
          right: APP_BUILD_WATERMARK_RIGHT_PX,
          bottom: APP_BUILD_WATERMARK_BOTTOM_PX,
          zIndex: 1300,
          pointerEvents: "none",
          opacity: APP_BUILD_WATERMARK_OPACITY,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: mode === "light" ? "#60779d" : "#aec3ef",
            letterSpacing: "0.035em",
            fontSize: APP_BUILD_WATERMARK_FONT_SIZE,
            fontWeight: APP_BUILD_WATERMARK_FONT_WEIGHT,
          }}
        >
          {`${APP_WATERMARK_VERSION} • ${watermarkBuildTimestamp}`}
        </Typography>
      </Box>
    </ThemeProvider>
  );
}

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppContent />
    </BrowserRouter>
  );
}

export default App
