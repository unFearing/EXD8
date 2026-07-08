import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DeckBoard } from "./components/DeckBoard";
import { RepositoryView } from "./components/RepositoryView";
import { AuthSplash } from "./components/AuthSplash";
import { useDiscordAuth } from "./hooks/useDiscordAuth";
import "./App.css";

type ThemeMode = "light" | "dark";
type ViewMode = "view" | "edit";

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
          appRole: "TL" as const,
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
      {!bypassDiscordAuth && <AuthSplash state={effectiveAuth} onLogin={effectiveAuth.login} />}
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
