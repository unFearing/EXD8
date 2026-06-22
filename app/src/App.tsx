import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { useMemo, useState } from "react";
import { DeckBoard } from "./components/DeckBoard";
import "./App.css";

type ThemeMode = "light" | "dark";

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

function App() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("ui-theme-mode");
    return stored === "light" || stored === "dark" ? stored : "dark";
  });

  const theme = useMemo(() => buildTheme(mode), [mode]);

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
      <DeckBoard mode={mode} onToggleMode={toggleMode} />
    </ThemeProvider>
  )
}

export default App
