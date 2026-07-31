import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Checkbox,
  Container,
  FormControlLabel,
  Paper,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CircleIcon from "@mui/icons-material/Circle";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DownloadIcon from "@mui/icons-material/Download";
import LightModeIcon from "@mui/icons-material/LightMode";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useNavigate } from "react-router-dom";
import { getDropDecks, getQuickslots } from "../api/client";
import type { DiscordUser } from "../hooks/useDiscordAuth";
import type { DeckRowDoc, DropDeckDoc, QuickslotEntry } from "../types/contracts";

type EditMode = "view" | "edit";
type TeamSide = "1" | "2" | "either";

type OverviewViewProps = {
  mode: "light" | "dark";
  onToggleMode: () => void;
  user: DiscordUser | null;
  onLogout: () => void;
  hasRole: (roleId: string) => boolean;
  viewMode: EditMode;
  onViewModeChange: (mode: EditMode) => void;
};

type DeckColumn = {
  id: string;
  name: string;
  map: string;
  sideLabel: string;
  rows: DeckRowDoc[];
  quickslotLabel: string;
};

type MechsConfigFile = {
  mechs: Record<string, Record<string, Record<string, { chassis_name: string; tonnage: number; chassis_code: string; variants: string[] }>>>;
};

type PilotAssignment = {
  deck: DeckColumn;
  row: DeckRowDoc;
  isPrimary: boolean;
  isAlternate: boolean;
  mechLabel: string;
  hasRepositoryData: boolean;
  repositoryUrl: string;
};

const PILOT_OPTIONS = [
  "Ex",
  "Saikyou",
  "Grill",
  "Xiph",
  "Ra",
  "Neir",
  "unF",
  "Acerg",
  "Heaven",
  "V",
  "GiL",
  "P4TCHY",
  "Bux",
  "Hydro",
  "Itsy",
  "Chap",
  "Awes",
];

const MATRIX_PRIMARY_COL_WIDTH = 140;
const MATRIX_ALT_COL_WIDTH = 140;
const MATRIX_ACTIONS_COL_WIDTH = 180;

function normalizeDeckSide(side: DropDeckDoc["side"]): TeamSide {
  if (side === "Team 1") return "1";
  if (side === "Team 2") return "2";
  if (side === "Agnostic") return "either";
  return side;
}

function sideLabel(side: TeamSide): string {
  if (side === "1") return "Team 1";
  if (side === "2") return "Team 2";
  return "Either";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeChassisName(value: string): string {
  return value.trim().toLowerCase().replace(/^clan\s+/, "").replace(/^inner sphere\s+/, "");
}

function mechLabelForRow(row: DeckRowDoc, chassisCodeByName: Record<string, string>): string {
  const variant = row.variant?.trim();
  if (variant) return variant;

  const chassis = row.chassis?.trim();
  if (chassis) {
    const configCode = chassisCodeByName[normalizeChassisName(chassis)];
    if (configCode?.trim()) return configCode.trim();

    const normalized = chassis.replace(/[^a-zA-Z0-9\s-]/g, " ").trim();
    const firstToken = normalized.split(/\s+/)[0] ?? "";
    if (firstToken.length <= 4) return firstToken.toUpperCase();
    return firstToken.slice(0, 3).toUpperCase();
  }

  if (row.weaponry?.trim()) return row.weaponry.trim();
  return "-";
}

function hasRepositoryDataForRow(row: DeckRowDoc): boolean {
  return Boolean(
    row.buildUrl?.trim() ||
    row.buildCode?.trim() ||
    row.skillTree?.trim() ||
    row.weaponry?.trim(),
  );
}

function repositoryUrlForRow(row: DeckRowDoc): string {
  const params = new URLSearchParams();
  params.set("view", "view");
  if (row.mech && isUuid(row.mech)) {
    params.set("focusMechId", row.mech);
  } else {
    if (row.chassis) params.set("focusChassis", row.chassis);
    if (row.variant) params.set("focusVariant", row.variant);
  }
  return `/repository?${params.toString()}`;
}

function getDeckColumns(docs: DropDeckDoc[], quickslots: QuickslotEntry[]): DeckColumn[] {
  const quickslotLookup = new Map<string, QuickslotEntry[]>();
  for (const entry of quickslots) {
    if (!entry.deckId) continue;
    const list = quickslotLookup.get(entry.deckId) ?? [];
    list.push(entry);
    quickslotLookup.set(entry.deckId, list);
  }

  return docs
    .map((doc) => {
      const normalizedSide = normalizeDeckSide(doc.side);
      const quickslotRows = quickslotLookup.get(doc.id) ?? [];
      const quickslotLabel = quickslotRows
        .map((entry) => `${entry.map} ${entry.slot}`)
        .join(" | ");

      return {
        id: doc.id,
        name: doc.name,
        map: doc.map,
        sideLabel: sideLabel(normalizedSide),
        rows: [...doc.deck].sort((a, b) => a.slot - b.slot),
        quickslotLabel,
      };
    })
    .sort((a, b) => {
      const mapDelta = a.map.localeCompare(b.map);
      if (mapDelta !== 0) return mapDelta;
      const sideDelta = a.sideLabel.localeCompare(b.sideLabel);
      if (sideDelta !== 0) return sideDelta;
      return a.name.localeCompare(b.name);
    });
}

  async function loadChassisCodes(): Promise<Record<string, string>> {
    try {
      const response = await fetch("/mechs_config.json");
      if (!response.ok) return {};
      const parsed = (await response.json()) as MechsConfigFile;
      const chassisCodeByName: Record<string, string> = {};

      for (const tech of Object.values(parsed.mechs ?? {})) {
        for (const byClass of Object.values(tech ?? {})) {
          for (const chassis of Object.values(byClass ?? {})) {
            const code = (chassis.chassis_code ?? "").trim();
            if (!code) continue;
            chassisCodeByName[normalizeChassisName(chassis.chassis_name)] = code;
          }
        }
      }

      return chassisCodeByName;
    } catch {
      return {};
    }
  }

export function OverviewView({
  mode,
  onToggleMode,
  user,
  onLogout,
  hasRole,
  viewMode,
  onViewModeChange,
}: OverviewViewProps) {
  const navigate = useNavigate();
  const isLight = mode === "light";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deckDocs, setDeckDocs] = useState<DropDeckDoc[]>([]);
  const [quickslots, setQuickslots] = useState<QuickslotEntry[]>([]);
  const [chassisCodeByName, setChassisCodeByName] = useState<Record<string, string>>({});
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [presentPilots, setPresentPilots] = useState<Set<string>>(new Set());
  const [showAssignedOnly, setShowAssignedOnly] = useState(true);
  const [showPresentOnly, setShowPresentOnly] = useState(true);

  void hasRole;
  void viewMode;
  void onViewModeChange;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([getDropDecks(), getQuickslots()])
      .then(([docs, quickslotDoc]) => {
        if (cancelled) return;
        setDeckDocs(docs);
        setQuickslots(quickslotDoc.slots ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load overview data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadChassisCodes()
      .then((codes) => {
        if (!cancelled) setChassisCodeByName(codes);
      })
      .catch(() => {
        if (!cancelled) setChassisCodeByName({});
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const deckColumns = useMemo(() => getDeckColumns(deckDocs, quickslots), [deckDocs, quickslots]);

  useEffect(() => {
    if (!deckColumns.length) {
      setSelectedDeckIds([]);
      return;
    }

    const quickslotDeckOrder = Array.from(
      new Set(
        quickslots
          .map((entry) => entry.deckId)
          .filter((deckId): deckId is string => Boolean(deckId))
          .filter((deckId) => deckColumns.some((column) => column.id === deckId)),
      ),
    );

    const defaults = quickslotDeckOrder.length
      ? quickslotDeckOrder
      : deckColumns.slice(0, Math.min(deckColumns.length, 6)).map((column) => column.id);

    setSelectedDeckIds((previous) => {
      if (previous.length) {
        const retained = previous.filter((id) => deckColumns.some((column) => column.id === id));
        if (retained.length) return retained;
      }
      return defaults;
    });
  }, [deckColumns, quickslots]);

  const selectedDeckColumns = useMemo(
    () => selectedDeckIds
      .map((deckId) => deckColumns.find((column) => column.id === deckId))
      .filter((column): column is DeckColumn => Boolean(column)),
    [deckColumns, selectedDeckIds],
  );

  const quickslotDeckIds = useMemo(
    () =>
      Array.from(
        new Set(
          quickslots
            .map((entry) => entry.deckId)
            .filter((deckId): deckId is string => Boolean(deckId))
            .filter((deckId) => deckColumns.some((column) => column.id === deckId)),
        ),
      ),
    [deckColumns, quickslots],
  );

  const allPilots = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];

    for (const pilot of PILOT_OPTIONS) {
      if (seen.has(pilot)) continue;
      seen.add(pilot);
      ordered.push(pilot);
    }

    for (const deck of selectedDeckColumns) {
      for (const row of deck.rows) {
        for (const pilot of row.primary ?? []) {
          if (seen.has(pilot)) continue;
          seen.add(pilot);
          ordered.push(pilot);
        }
        for (const pilot of row.alternates ?? []) {
          if (seen.has(pilot)) continue;
          seen.add(pilot);
          ordered.push(pilot);
        }
      }
    }

    return ordered;
  }, [selectedDeckColumns]);

  useEffect(() => {
    if (!allPilots.length || presentPilots.size > 0) return;
    setPresentPilots(new Set(allPilots));
  }, [allPilots, presentPilots.size]);

  const presentPilotList = useMemo(
    () => allPilots.filter((pilot) => presentPilots.has(pilot)),
    [allPilots, presentPilots],
  );

  const getPilotAssignments = (pilot: string): PilotAssignment[] => {
    const assignments: PilotAssignment[] = [];

    for (const deck of selectedDeckColumns) {
      for (const row of deck.rows) {
        const isPrimary = (row.primary ?? []).includes(pilot);
        const isAlternate = (row.alternates ?? []).includes(pilot);
        if (!isPrimary && !isAlternate) continue;

        assignments.push({
          deck,
          row,
          isPrimary,
          isAlternate,
          mechLabel: mechLabelForRow(row, chassisCodeByName),
          hasRepositoryData: hasRepositoryDataForRow(row),
          repositoryUrl: repositoryUrlForRow(row),
        });
      }
    }

    return assignments;
  };

  const assignmentsByPilot = useMemo(() => {
    const map = new Map<string, PilotAssignment[]>();
    for (const pilot of allPilots) {
      map.set(pilot, getPilotAssignments(pilot));
    }
    return map;
  }, [allPilots, chassisCodeByName, selectedDeckColumns]);

  const visiblePilotList = useMemo(() => {
    const source = showPresentOnly ? presentPilotList : allPilots;
    if (!showAssignedOnly) return source;
    return source.filter((pilot) => (assignmentsByPilot.get(pilot)?.length ?? 0) > 0);
  }, [allPilots, assignmentsByPilot, presentPilotList, showAssignedOnly, showPresentOnly]);

  const totalAssignments = useMemo(
    () => visiblePilotList.reduce((sum, pilot) => sum + (assignmentsByPilot.get(pilot)?.length ?? 0), 0),
    [assignmentsByPilot, visiblePilotList],
  );

  const togglePilotPresence = (pilot: string) => {
    setPresentPilots((previous) => {
      const next = new Set(previous);
      if (next.has(pilot)) {
        next.delete(pilot);
      } else {
        next.add(pilot);
      }
      return next;
    });
  };

  const toggleDeckInMatrix = (deckId: string) => {
    setSelectedDeckIds((previous) => {
      if (previous.includes(deckId)) {
        return previous.filter((id) => id !== deckId);
      }
      return [...previous, deckId];
    });
  };

  const downloadPilotNightPack = (pilot: string) => {
    const assignments = getPilotAssignments(pilot);
    const lines: string[] = [
      `Pilot: ${pilot}`,
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "Night Build Pack",
      "",
    ];

    if (!assignments.length) {
      lines.push("No builds assigned for selected decks.");
    }

    for (const assignment of assignments) {
      const roleText = assignment.isPrimary && assignment.isAlternate
        ? "Primary + Alternate"
        : assignment.isPrimary
          ? "Primary"
          : "Alternate";

      lines.push(`Deck: ${assignment.deck.map} | ${assignment.deck.sideLabel} | ${assignment.deck.name}`);
      lines.push(`Slot: ${assignment.row.slot} (${roleText})`);
      lines.push(`Mech: ${assignment.mechLabel}`);
      lines.push(`NAV-Alpha Link: ${assignment.row.buildUrl?.trim() || "(none)"}`);
      lines.push(`Export Code: ${assignment.row.buildCode?.trim() || "(none)"}`);
      lines.push(`Skill Tree: ${assignment.row.skillTree?.trim() || "(none)"}`);
      lines.push("");
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${pilot.replace(/\s+/g, "-").toLowerCase()}-night-builds.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background:
          isLight
            ? "radial-gradient(circle at 8% 10%, rgba(132, 154, 184, 0.22), transparent 35%), radial-gradient(circle at 90% 0%, rgba(170, 179, 191, 0.22), transparent 40%), #e3e9f0"
            : "radial-gradient(circle at 8% 10%, rgba(167, 196, 255, 0.18), transparent 35%), radial-gradient(circle at 90% 0%, rgba(119, 140, 191, 0.18), transparent 40%), #0c101d",
        pb: 3,
      }}
    >
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          background: isLight ? "rgba(229, 236, 246, 0.93)" : "rgba(9, 14, 28, 0.9)",
          borderBottom: isLight ? "1px solid rgba(111, 130, 160, 0.34)" : "1px solid rgba(130, 154, 217, 0.32)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Box sx={{ pl: { xs: 2, md: 6.5 }, pr: { xs: 1.5, md: 2.75 }, py: 1.25, display: "grid", gap: 1.25 }}>
          <Stack direction="row" spacing={2.2} sx={{ alignItems: "center", flexWrap: "nowrap", justifyContent: "space-between" }}>
            <Stack direction="row" spacing={1.6} sx={{ alignItems: "center", flexWrap: "nowrap", minWidth: 0 }}>
              <Typography sx={{ color: isLight ? "#2f3e58" : "#eff5ff", fontWeight: 700, letterSpacing: "0.02em", mr: 0.6 }}>
                EXDEATE
              </Typography>

              <Tabs
                value="overview"
                onChange={(_, value: string) => {
                  if (value === "dropDecks") navigate("/");
                  if (value === "repository") navigate("/repository");
                }}
                variant="standard"
                sx={{
                  minHeight: 38,
                  "& .MuiTab-root": { color: isLight ? "#566987" : "#cbd6f6", minHeight: 38, py: 0, px: 1.8 },
                  "& .Mui-selected": { color: isLight ? "#26364f" : "#ffffff" },
                }}
              >
                <Tab label="Drop Decks" value="dropDecks" />
                <Tab label="Repository" value="repository" />
                <Tab label="Overview" value="overview" />
              </Tabs>
            </Stack>

            <Stack direction="row" spacing={1.35} sx={{ ml: "auto", alignItems: "center", flexWrap: "nowrap", justifyContent: "flex-end", flexShrink: 0 }}>
              {user && (
                <Typography sx={{ color: isLight ? "#556987" : "#cbd6f6", fontSize: "0.92rem", display: { xs: "none", sm: "block" } }}>
                  {user.username}
                </Typography>
              )}

              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => navigate("/repository", { state: { openAddBuild: true } })}
                sx={{
                  background: isLight ? "rgba(58, 111, 189, 0.85)" : "rgba(127, 179, 255, 0.18)",
                  color: isLight ? "#fff" : "#7fb3ff",
                  textTransform: "none",
                  borderRadius: 1,
                  px: 2,
                  minHeight: 38,
                  fontWeight: 700,
                  "&:hover": {
                    background: isLight ? "rgba(58, 111, 189, 0.95)" : "rgba(127, 179, 255, 0.28)",
                  },
                }}
              >
                Add Build
              </Button>

              <Button
                variant="outlined"
                size="small"
                onClick={() => onViewModeChange(viewMode === "edit" ? "view" : "edit")}
                sx={{
                  color: isLight ? "#4e6486" : "#c8d8ff",
                  borderColor: isLight ? "rgba(108, 128, 158, 0.35)" : "rgba(130, 154, 217, 0.32)",
                  minHeight: 38,
                  px: 1.6,
                  textTransform: "none",
                }}
              >
                {viewMode === "edit" ? "Editing" : "Viewing"}
              </Button>

              <Tooltip title={isLight ? "Switch to dark mode" : "Switch to light mode"}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={onToggleMode}
                  sx={{
                    minWidth: 38,
                    width: 38,
                    height: 38,
                    p: 0,
                    color: isLight ? "#4e6486" : "#c8d8ff",
                    borderColor: isLight ? "rgba(108, 128, 158, 0.35)" : "rgba(130, 154, 217, 0.32)",
                  }}
                >
                  {isLight ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
                </Button>
              </Tooltip>

              <Button
                variant="outlined"
                size="small"
                onClick={onLogout}
                sx={{
                  textTransform: "none",
                  color: isLight ? "#4e6486" : "#c8d8ff",
                  borderColor: isLight ? "rgba(108, 128, 158, 0.35)" : "rgba(130, 154, 217, 0.32)",
                  minHeight: 38,
                  px: 1.5,
                }}
              >
                Logout
              </Button>
            </Stack>
          </Stack>
        </Box>
      </AppBar>

      <Container maxWidth={false} sx={{ px: { xs: 1.5, md: 2.5 }, pt: 1.7 }}>
        <Stack spacing={1.2}>
          {error && <Alert severity="error">{error}</Alert>}
          {loading && <Alert severity="info">Loading overview...</Alert>}

          <Paper
            sx={{
              p: 1.2,
              border: isLight ? "1px solid rgba(114, 133, 162, 0.34)" : "1px solid rgba(130, 154, 217, 0.35)",
              background: isLight ? "rgba(236, 242, 249, 0.95)" : "rgba(11, 16, 33, 0.9)",
            }}
          >
            <Stack spacing={1.2}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { xs: "flex-start", md: "center" } }}>
                <Box>
                  <Typography sx={{ color: isLight ? "#2f3f59" : "#eff4ff", fontWeight: 700 }}>
                    Night Overview
                  </Typography>
                  <Typography variant="body2" sx={{ color: isLight ? "#5f7394" : "#aec2ee" }}>
                    Cross-match who is present with tonight's deck plan, then open or export each pilot's build pack.
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.8} sx={{ flexWrap: "wrap" }}>
                  <Box sx={{ px: 1, py: 0.6, borderRadius: 1, border: isLight ? "1px solid rgba(122, 143, 174, 0.3)" : "1px solid rgba(120, 146, 210, 0.3)" }}>
                    <Typography variant="caption" sx={{ color: isLight ? "#4f6282" : "#c9d8ff", fontWeight: 700 }}>
                      Present: {presentPilots.size}/{allPilots.length}
                    </Typography>
                  </Box>
                  <Box sx={{ px: 1, py: 0.6, borderRadius: 1, border: isLight ? "1px solid rgba(122, 143, 174, 0.3)" : "1px solid rgba(120, 146, 210, 0.3)" }}>
                    <Typography variant="caption" sx={{ color: isLight ? "#4f6282" : "#c9d8ff", fontWeight: 700 }}>
                      Deck Columns: {selectedDeckColumns.length}
                    </Typography>
                  </Box>
                  <Box sx={{ px: 1, py: 0.6, borderRadius: 1, border: isLight ? "1px solid rgba(122, 143, 174, 0.3)" : "1px solid rgba(120, 146, 210, 0.3)" }}>
                    <Typography variant="caption" sx={{ color: isLight ? "#4f6282" : "#c9d8ff", fontWeight: 700 }}>
                      Assignments: {totalAssignments}
                    </Typography>
                  </Box>
                </Stack>
              </Stack>

              <Stack direction={{ xs: "column", md: "row" }} spacing={1.1} sx={{ alignItems: { xs: "stretch", md: "center" }, justifyContent: "space-between", flexWrap: "wrap" }}>
                <Stack direction="row" spacing={0.7} sx={{ flexWrap: "wrap", alignItems: "center" }}>
                  <Typography variant="caption" sx={{ color: isLight ? "#5b6f90" : "#b8c9ef", fontWeight: 700 }}>
                    Pilot Filters
                  </Typography>
                  <Button size="small" onClick={() => setPresentPilots(new Set(allPilots))} sx={{ textTransform: "none" }}>All Present</Button>
                  <Button size="small" onClick={() => setPresentPilots(new Set())} sx={{ textTransform: "none" }}>None Present</Button>
                  <Button
                    size="small"
                    variant={showPresentOnly ? "contained" : "outlined"}
                    onClick={() => setShowPresentOnly((previous) => !previous)}
                    sx={{ textTransform: "none" }}
                  >
                    {showPresentOnly ? "Present Only" : "All Pilots"}
                  </Button>
                  <Button
                    size="small"
                    variant={showAssignedOnly ? "contained" : "outlined"}
                    onClick={() => setShowAssignedOnly((previous) => !previous)}
                    sx={{ textTransform: "none" }}
                  >
                    {showAssignedOnly ? "Assigned Only" : "Include Unassigned"}
                  </Button>
                </Stack>

                <Box sx={{ minWidth: 0, flex: 1.1 }}>
                  <Stack direction="row" spacing={0.7} sx={{ alignItems: "center", mb: 0.6, flexWrap: "wrap" }}>
                    <Typography variant="caption" sx={{ color: isLight ? "#5b6f90" : "#b8c9ef", fontWeight: 700 }}>
                      Tonight Deck Columns (Map + Side)
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => setSelectedDeckIds(deckColumns.map((deck) => deck.id))}
                      sx={{ textTransform: "none" }}
                    >
                      All
                    </Button>
                    <Button size="small" onClick={() => setSelectedDeckIds([])} sx={{ textTransform: "none" }}>
                      None
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setSelectedDeckIds(quickslotDeckIds)}
                      sx={{ textTransform: "none" }}
                    >
                      Quickslot Set
                    </Button>
                  </Stack>
                  <Stack spacing={0.2}>
                    {deckColumns.map((deck) => (
                      <FormControlLabel
                        key={deck.id}
                        control={<Checkbox size="small" checked={selectedDeckIds.includes(deck.id)} onChange={() => toggleDeckInMatrix(deck.id)} />}
                        label={`${deck.map} | ${deck.sideLabel} | ${deck.name}${deck.quickslotLabel ? ` (${deck.quickslotLabel})` : ""}`}
                        sx={{ mr: 0.2 }}
                      />
                    ))}
                  </Stack>
                </Box>
              </Stack>
            </Stack>
          </Paper>

          <TableContainer
            component={Paper}
            sx={{
              border: isLight ? "1px solid rgba(114, 133, 162, 0.34)" : "1px solid rgba(130, 154, 217, 0.35)",
              background: isLight ? "rgba(236, 242, 249, 0.95)" : "rgba(11, 16, 33, 0.9)",
              maxHeight: "68vh",
            }}
          >
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ position: "sticky", left: 0, zIndex: 5, width: MATRIX_PRIMARY_COL_WIDTH, minWidth: MATRIX_PRIMARY_COL_WIDTH, background: isLight ? "rgba(227, 236, 247, 0.98)" : "rgba(15, 22, 43, 0.98)", fontWeight: 700 }}>Primary</TableCell>
                  <TableCell sx={{ position: "sticky", left: MATRIX_PRIMARY_COL_WIDTH, zIndex: 5, width: MATRIX_ALT_COL_WIDTH, minWidth: MATRIX_ALT_COL_WIDTH, background: isLight ? "rgba(227, 236, 247, 0.98)" : "rgba(15, 22, 43, 0.98)", fontWeight: 700 }}>Alternates</TableCell>
                  <TableCell sx={{ position: "sticky", left: MATRIX_PRIMARY_COL_WIDTH + MATRIX_ALT_COL_WIDTH, zIndex: 5, width: MATRIX_ACTIONS_COL_WIDTH, minWidth: MATRIX_ACTIONS_COL_WIDTH, background: isLight ? "rgba(227, 236, 247, 0.98)" : "rgba(15, 22, 43, 0.98)", fontWeight: 700 }}>Actions</TableCell>
                  {selectedDeckColumns.map((deck) => (
                    <TableCell
                      key={deck.id}
                      sx={{
                        minWidth: 250,
                        background: isLight ? "rgba(227, 236, 247, 0.98)" : "rgba(15, 22, 43, 0.98)",
                        fontWeight: 700,
                      }}
                    >
                      <Stack spacing={0}>
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>{deck.map} | {deck.sideLabel}</Typography>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>{deck.name}</Typography>
                      </Stack>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {visiblePilotList.map((pilot) => {
                  const allAssignments = assignmentsByPilot.get(pilot) ?? [];
                  const hasPrimary = allAssignments.some((entry) => entry.isPrimary);
                  const hasAlternate = allAssignments.some((entry) => entry.isAlternate);
                  const pilotPresent = presentPilots.has(pilot);
                  const stickyBg = pilotPresent
                    ? (isLight ? "rgba(236, 242, 249, 0.98)" : "rgba(11, 16, 33, 0.96)")
                    : (isLight ? "rgba(223, 231, 243, 0.74)" : "rgba(17, 25, 48, 0.75)");

                  return (
                    <TableRow key={pilot} hover>
                      <TableCell
                        sx={{
                          position: "sticky",
                          left: 0,
                          zIndex: 4,
                          background: stickyBg,
                          width: MATRIX_PRIMARY_COL_WIDTH,
                          minWidth: MATRIX_PRIMARY_COL_WIDTH,
                          opacity: pilotPresent ? 1 : 0.72,
                        }}
                      >
                        {hasPrimary ? pilot : "-"}
                      </TableCell>
                      <TableCell
                        sx={{
                          position: "sticky",
                          left: MATRIX_PRIMARY_COL_WIDTH,
                          zIndex: 4,
                          background: stickyBg,
                          width: MATRIX_ALT_COL_WIDTH,
                          minWidth: MATRIX_ALT_COL_WIDTH,
                          opacity: pilotPresent ? 1 : 0.72,
                        }}
                      >
                        {hasAlternate ? pilot : "-"}
                      </TableCell>
                      <TableCell
                        sx={{
                          position: "sticky",
                          left: MATRIX_PRIMARY_COL_WIDTH + MATRIX_ALT_COL_WIDTH,
                          zIndex: 4,
                          background: stickyBg,
                          width: MATRIX_ACTIONS_COL_WIDTH,
                          minWidth: MATRIX_ACTIONS_COL_WIDTH,
                        }}
                      >
                        <Stack direction="row" spacing={0.6}>
                          <Checkbox
                            size="small"
                            checked={pilotPresent}
                            onChange={() => togglePilotPresence(pilot)}
                            sx={{ p: 0.3 }}
                          />
                          <Button size="small" variant="outlined" startIcon={<DownloadIcon fontSize="small" />} onClick={() => downloadPilotNightPack(pilot)} sx={{ textTransform: "none" }}>
                            Export
                          </Button>
                        </Stack>
                      </TableCell>

                      {selectedDeckColumns.map((deck) => {
                        const deckAssignments = allAssignments.filter((entry) => entry.deck.id === deck.id);
                        return (
                          <TableCell key={`${pilot}-${deck.id}`} sx={{ opacity: pilotPresent ? 1 : 0.72 }}>
                            {!deckAssignments.length ? (
                              <Typography variant="body2" sx={{ opacity: 0.58 }}>-</Typography>
                            ) : (
                              <Stack spacing={0.45}>
                                {deckAssignments.map((entry) => {
                                  const roleTitle = entry.isPrimary && entry.isAlternate
                                    ? "Primary + Alternate"
                                    : entry.isPrimary
                                      ? "Primary"
                                      : "Alternate";
                                  const roleColor = entry.isPrimary && entry.isAlternate
                                    ? (isLight ? "#7a4fbd" : "#b79dff")
                                    : entry.isPrimary
                                      ? (isLight ? "#2f6fbd" : "#8ec2ff")
                                      : (isLight ? "#ba7a2d" : "#f2bf7c");
                                  return (
                                    <Button
                                      key={`${pilot}-${deck.id}-${entry.row.slot}-${entry.mechLabel}`}
                                      size="small"
                                      variant="text"
                                      endIcon={<OpenInNewIcon fontSize="inherit" />}
                                      onClick={() => window.open(entry.repositoryUrl, "_blank", "noopener,noreferrer")}
                                      sx={{
                                        justifyContent: "flex-start",
                                        textTransform: "none",
                                        px: 0,
                                        minHeight: 26,
                                      }}
                                    >
                                      <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", minWidth: 0 }}>
                                        <Tooltip title={roleTitle}>
                                          <CircleIcon sx={{ fontSize: "0.54rem", color: roleColor, flexShrink: 0 }} />
                                        </Tooltip>
                                        <Typography variant="body2" sx={{ fontSize: "0.78rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                          {`${entry.row.slot}. ${entry.mechLabel}`}
                                          {!entry.hasRepositoryData ? " *" : ""}
                                        </Typography>
                                      </Stack>
                                    </Button>
                                  );
                                })}
                              </Stack>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Paper
            sx={{
              p: 1,
              border: isLight ? "1px solid rgba(114, 133, 162, 0.34)" : "1px solid rgba(130, 154, 217, 0.35)",
              background: isLight ? "rgba(236, 242, 249, 0.95)" : "rgba(11, 16, 33, 0.9)",
            }}
          >
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.2} sx={{ alignItems: { xs: "flex-start", md: "center" }, justifyContent: "space-between" }}>
              <Stack direction="row" spacing={1.2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                  <CircleIcon sx={{ fontSize: "0.55rem", color: isLight ? "#2f6fbd" : "#8ec2ff" }} />
                  <Typography variant="caption" sx={{ color: isLight ? "#4f6282" : "#c9d8ff" }}>Primary</Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                  <CircleIcon sx={{ fontSize: "0.55rem", color: isLight ? "#ba7a2d" : "#f2bf7c" }} />
                  <Typography variant="caption" sx={{ color: isLight ? "#4f6282" : "#c9d8ff" }}>Alternate</Typography>
                </Stack>
                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                  <CircleIcon sx={{ fontSize: "0.55rem", color: isLight ? "#7a4fbd" : "#b79dff" }} />
                  <Typography variant="caption" sx={{ color: isLight ? "#4f6282" : "#c9d8ff" }}>Both</Typography>
                </Stack>
              </Stack>
              <Typography variant="caption" sx={{ color: isLight ? "#5f7394" : "#aec2ee" }}>
                * Mech selected, but repository build data is missing.
              </Typography>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}
