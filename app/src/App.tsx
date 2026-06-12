import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { DeckBoard } from "./components/DeckBoard";
import "./App.css";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#90caf9",
    },
    secondary: {
      main: "#ffb74d",
    },
    background: {
      default: "#0b1020",
      paper: "#131b36",
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

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DeckBoard />
    </ThemeProvider>
  )
}

export default App
