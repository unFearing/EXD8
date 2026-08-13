import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Checkbox,
  Container,
  FormControlLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
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
import { useNavigate } from "react-router-dom";
import { getDropDecks, getQuickslots, saveQuickslotOverviewSelection } from "../api/client";
import { CS26_COMPETITION } from "../constants/competition";
import type { DiscordUser } from "../hooks/useDiscordAuth";
import type { DeckRowDoc, DropDeckDoc, QuickslotEntry } from "../types/contracts";
import { resolveAppRole } from "../utils/discordRoles";

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
};

type MapDeckColumn = {
  map: string;
  decks: DeckColumn[];
};

const PILOT_OPTIONS = [
  "Ex",
  "Saikyou",
  "Grill",
  "Xiph",
  "Ra",
  "Neir",
  "unF",
  "Heaven",
  "GT",
  "V",
  "P4TCHY",
  "Bux",
  "Itsy",
  "Acerg",
  "GiL",
  "Chap",
  "Hydro",
  "Awes"
];

const MATRIX_PRIMARY_COL_WIDTH = 110;
const MATRIX_ALT_COL_WIDTH = 110;
const MATRIX_STATUS_COL_WIDTH = 130;
const MATRIX_PACK_COL_WIDTH = 54;
const OVERVIEW_SELECTION_STORAGE_PREFIX = "overview-deck-selection";

function getLocalSelectionStorageKey(userId: string | undefined): string {
  return `${OVERVIEW_SELECTION_STORAGE_PREFIX}:EXD8:${userId ?? "anonymous"}`;
}

function readLocalSelection(userId: string | undefined): string[] | null {
  try {
    const raw = localStorage.getItem(getLocalSelectionStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.every((value) => typeof value === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

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

function normalizeChassisName(value: string): string {
  return value.trim().toLowerCase().replace(/^clan\s+/, "").replace(/^inner sphere\s+/, "");
}

function configuredVariantCode(variants: string[]): string {
  const codedVariants = variants.map((variant) => variant.trim()).filter((variant) => variant.includes("-"));
  if (!codedVariants.length) return "";

  let prefix = codedVariants[0];
  for (const variant of codedVariants.slice(1)) {
    while (prefix && !variant.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  const code = prefix.replace(/-+$/, "");
  return code.length >= 2 ? code : "";
}

function localDateForFilename(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}-${date.getFullYear()}`;
}

function mechLabelForRow(row: DeckRowDoc, chassisCodeByName: Record<string, string>): string {
  const variant = row.variant?.trim();
  if (variant) return variant;

  const chassis = row.chassis?.trim();
  if (chassis) {
    const configCode = chassisCodeByName[normalizeChassisName(chassis)];
    if (configCode?.trim()) return configCode.trim();

    return chassis;
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
            const code = (chassis.chassis_code ?? "").trim() || configuredVariantCode(chassis.variants ?? []);
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
    const openMechInRepository = (row: DeckRowDoc) => {
      navigate("/repository", {
        state: {
          focusMechId: row.mech || undefined,
          focusChassis: row.chassis || undefined,
          focusVariant: row.variant || undefined,
        },
      });
    };
  const isLight = mode === "light";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deckDocs, setDeckDocs] = useState<DropDeckDoc[]>([]);
  const [quickslots, setQuickslots] = useState<QuickslotEntry[]>([]);
  const [chassisCodeByName, setChassisCodeByName] = useState<Record<string, string>>({});
  const [serverSelectedDeckIds, setServerSelectedDeckIds] = useState<string[] | null>(null);
  const [localSelectedDeckIds, setLocalSelectedDeckIds] = useState<string[]>([]);
  const [useLocalOverride, setUseLocalOverride] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const [slottedPilots, setSlottedPilots] = useState<Record<string, string>>({});
  const [showAssignedOnly, setShowAssignedOnly] = useState(true);
  const canManage = resolveAppRole(user?.roles ?? [], user?.appRole) === "TL";

  void hasRole;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([getDropDecks(), getQuickslots()])
      .then(([docs, quickslotDoc]) => {
        if (cancelled) return;
        setDeckDocs(docs);
        setQuickslots(quickslotDoc.slots ?? []);
        setServerSelectedDeckIds(quickslotDoc.overviewSelectedDeckIds ?? null);
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

  const defaultSelectedDeckIds = useMemo(() => {
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
    return defaults;
  }, [deckColumns, quickslots]);

  const sharedSelectedDeckIds = useMemo(() => {
    const source = serverSelectedDeckIds ?? defaultSelectedDeckIds;
    return source.filter((id) => deckColumns.some((column) => column.id === id));
  }, [deckColumns, defaultSelectedDeckIds, serverSelectedDeckIds]);

  useEffect(() => {
    const stored = readLocalSelection(user?.id);
    const source = stored ?? sharedSelectedDeckIds;
    setLocalSelectedDeckIds(source.filter((id) => deckColumns.some((column) => column.id === id)));
  }, [deckColumns, sharedSelectedDeckIds, user?.id]);

  const selectedDeckIds = useLocalOverride ? localSelectedDeckIds : sharedSelectedDeckIds;

  const selectedDeckColumns = useMemo(
    () => selectedDeckIds
      .map((deckId) => deckColumns.find((column) => column.id === deckId))
      .filter((column): column is DeckColumn => Boolean(column)),
    [deckColumns, selectedDeckIds],
  );

  const mapSelectorColumns = useMemo<MapDeckColumn[]>(() => (
    CS26_COMPETITION.majorTabs.map((map) => ({
      map,
      decks: quickslots
        .filter((entry) => entry.map === map && entry.deckId)
        .sort((left, right) => left.slot.localeCompare(right.slot))
        .map((entry) => deckColumns.find((deck) => deck.id === entry.deckId))
        .filter((deck): deck is DeckColumn => Boolean(deck)),
    }))
  ), [deckColumns, quickslots]);

  const selectedMapColumns = useMemo<MapDeckColumn[]>(() => (
    CS26_COMPETITION.majorTabs
      .map((map) => ({ map, decks: selectedDeckColumns.filter((deck) => deck.map === map) }))
      .filter((column) => column.decks.length > 0)
  ), [selectedDeckColumns]);

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
    if (!showAssignedOnly) return allPilots;
    return allPilots.filter((pilot) => (assignmentsByPilot.get(pilot)?.length ?? 0) > 0);
  }, [allPilots, assignmentsByPilot, showAssignedOnly]);

  const totalAssignments = useMemo(
    () => visiblePilotList.reduce((sum, pilot) => sum + (assignmentsByPilot.get(pilot)?.length ?? 0), 0),
    [assignmentsByPilot, visiblePilotList],
  );

  const applySelectedDeckIds = async (next: string[]) => {
    const normalized = Array.from(new Set(next));
    if (useLocalOverride) {
      setLocalSelectedDeckIds(normalized);
      localStorage.setItem(getLocalSelectionStorageKey(user?.id), JSON.stringify(normalized));
      return;
    }
    if (!canManage || savingSelection) return;

    const previous = serverSelectedDeckIds;
    setServerSelectedDeckIds(normalized);
    setSavingSelection(true);
    setError("");
    try {
      const saved = await saveQuickslotOverviewSelection({
        id: "quickslots-default",
        overviewSelectedDeckIds: normalized,
      });
      setServerSelectedDeckIds(saved.overviewSelectedDeckIds ?? normalized);
    } catch (saveError) {
      setServerSelectedDeckIds(previous);
      setError(saveError instanceof Error ? saveError.message : "Failed to save TL selection");
    } finally {
      setSavingSelection(false);
    }
  };

  const toggleDeckInMatrix = (deckId: string) => {
    void applySelectedDeckIds(
      selectedDeckIds.includes(deckId)
        ? selectedDeckIds.filter((id) => id !== deckId)
        : [...selectedDeckIds, deckId],
    );
  };

  const setLocalOverride = (enabled: boolean) => {
    if (enabled) {
      const stored = readLocalSelection(user?.id);
      setLocalSelectedDeckIds(stored ?? sharedSelectedDeckIds);
    }
    setUseLocalOverride(enabled);
  };

  const downloadPilotNightPack = (pilot: string) => {
    const assignments = getPilotAssignments(pilot);
    const lines: string[] = [
      `Pilot: ${pilot}`,
      `Generated: ${new Date().toLocaleString()}`,
      "",
      "Build Pack",
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
    anchor.download = `${pilot.replace(/\s+/g, "-").toLowerCase()}-builds-${localDateForFilename(new Date())}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        maxWidth: "100vw",
        overflowX: "hidden",
        background:
          isLight
            ? "radial-gradient(circle at 8% 10%, rgba(132, 154, 184, 0.22), transparent 35%), radial-gradient(circle at 90% 0%, rgba(170, 179, 191, 0.22), transparent 40%), #e3e9f0"
            : "radial-gradient(circle at 8% 10%, rgba(167, 196, 255, 0.18), transparent 35%), radial-gradient(circle at 90% 0%, rgba(119, 140, 191, 0.18), transparent 40%), #0c101d",
        pb: 3,
        "& .MuiPaper-root, & .MuiButton-root, & .MuiButtonGroup-root, & .MuiOutlinedInput-root, & .MuiAlert-root, & .MuiDialog-paper": {
          borderRadius: "0 !important",
        },
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
          <Stack direction={{ xs: "column", lg: "row" }} spacing={{ xs: 0.7, lg: 2.2 }} sx={{ alignItems: { xs: "stretch", lg: "center" }, justifyContent: "space-between", minWidth: 0 }}>
            <Stack direction="row" spacing={1.6} sx={{ alignItems: "center", minWidth: 0, flex: { lg: 1 } }}>
              <Typography sx={{ color: isLight ? "#2f3e58" : "#eff5ff", fontWeight: 700, letterSpacing: "0.02em", mr: 0.6, display: { xs: "none", md: "block" } }}>
                EXDEATE
              </Typography>

              <Tabs
                value="overview"
                onChange={(_, value: string) => {
                  if (value === "dropDecks") navigate("/");
                  if (value === "repository") navigate("/repository");
                }}
                variant="scrollable"
                scrollButtons={false}
                sx={{
                  minHeight: 38,
                  maxWidth: "100%",
                  "& .MuiTab-root": { color: isLight ? "#566987" : "#cbd6f6", minHeight: 38, minWidth: 0, py: 0, px: { xs: 1.1, sm: 1.8 } },
                  "& .Mui-selected": { color: isLight ? "#26364f" : "#ffffff" },
                }}
              >
                <Tab label="Drop Decks" value="dropDecks" />
                <Tab label="Repository" value="repository" />
                <Tab label="Overview" value="overview" />
              </Tabs>
            </Stack>

            <Stack direction="row" spacing={0.7} sx={{ ml: { lg: "auto" }, alignItems: "center", flexWrap: { xs: "wrap", lg: "nowrap" }, justifyContent: { xs: "flex-start", lg: "flex-end" }, minWidth: 0, flexShrink: 0 }}>
              {user && (
                <Typography sx={{ color: isLight ? "#556987" : "#cbd6f6", fontSize: "0.92rem", display: { xs: "none", sm: "block" }, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.username}
                </Typography>
              )}

              {canManage && (
                <>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => navigate("/repository", { state: { openAddBuild: true } })}
                    sx={{
                      background: isLight ? "rgba(58, 111, 189, 0.85)" : "rgba(127, 179, 255, 0.18)",
                      color: isLight ? "#fff" : "#7fb3ff",
                      textTransform: "none",
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
                </>
              )}

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

      <Container maxWidth={false} sx={{ width: "100%", maxWidth: "100%", minWidth: 0, px: { xs: 1.5, md: 2.5 }, pt: 1.7 }}>
        <Stack spacing={1.2} sx={{ minWidth: 0 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {loading && <Alert severity="info">Loading overview...</Alert>}

          <Paper
            sx={{
              px: 1.2,
              py: 0.8,
              border: isLight ? "1px solid rgba(114, 133, 162, 0.34)" : "1px solid rgba(130, 154, 217, 0.35)",
              background: isLight ? "rgba(236, 242, 249, 0.95)" : "rgba(11, 16, 33, 0.9)",
            }}
          >
            <Stack spacing={0.55}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={0.7} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", flexWrap: "wrap" }}>
                  <Typography sx={{ color: isLight ? "#2f3f59" : "#eff4ff", fontWeight: 700 }}>Night Overview</Typography>
                  <Typography variant="caption" sx={{ color: isLight ? "#5f7394" : "#aec2ee", fontWeight: 700 }}>
                    {visiblePilotList.length} pilots · {selectedDeckColumns.length} decks · {totalAssignments} assignments
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={0.6} sx={{ flexWrap: "wrap" }}>
                  <Button size="small" variant={showAssignedOnly ? "contained" : "outlined"} onClick={() => setShowAssignedOnly((previous) => !previous)} sx={{ textTransform: "none" }}>
                    {showAssignedOnly ? "Assigned Only" : "Include Unassigned"}
                  </Button>
                </Stack>
              </Stack>

              <Stack direction="row" spacing={0.6} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Stack spacing={0}>
                  <Typography variant="caption" sx={{ color: isLight ? "#5b6f90" : "#b8c9ef", fontWeight: 700 }}>Quickslots By Map</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.7 }}>
                    {useLocalOverride ? "Personal filters on this browser" : savingSelection ? "Saving TL selection..." : "Following TL selection"}
                  </Typography>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={0.4} sx={{ alignItems: { sm: "center" } }}>
                  <FormControlLabel
                    control={<Switch size="small" checked={useLocalOverride} onChange={(_, checked) => setLocalOverride(checked)} />}
                    label="Use my filters"
                    sx={{ m: 0, "& .MuiFormControlLabel-label": { fontSize: "0.76rem", fontWeight: 700 } }}
                  />
                  <Button size="small" disabled={!useLocalOverride && (!canManage || savingSelection)} onClick={() => void applySelectedDeckIds(Array.from(new Set(mapSelectorColumns.flatMap((column) => column.decks.map((deck) => deck.id)))))} sx={{ textTransform: "none" }}>Select All</Button>
                  <Button size="small" disabled={!useLocalOverride && (!canManage || savingSelection)} onClick={() => void applySelectedDeckIds([])} sx={{ textTransform: "none" }}>Clear</Button>
                </Stack>
              </Stack>

              <Box
                data-testid="quickslot-deck-grid"
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))", xl: "repeat(5, minmax(0, 1fr))" },
                  borderTop: isLight ? "1px solid rgba(122, 143, 174, 0.24)" : "1px solid rgba(120, 146, 210, 0.24)",
                  borderLeft: isLight ? "1px solid rgba(122, 143, 174, 0.24)" : "1px solid rgba(120, 146, 210, 0.24)",
                }}
              >
                {mapSelectorColumns.map((column) => (
                  <Box
                    key={column.map}
                    data-testid={`quickslot-map-${column.map}`}
                    sx={{
                      minWidth: 0,
                      borderRight: isLight ? "1px solid rgba(122, 143, 174, 0.24)" : "1px solid rgba(120, 146, 210, 0.24)",
                      borderBottom: isLight ? "1px solid rgba(122, 143, 174, 0.24)" : "1px solid rgba(120, 146, 210, 0.24)",
                    }}
                  >
                    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", background: isLight ? "rgba(210, 222, 237, 0.58)" : "rgba(39, 57, 94, 0.42)" }}>
                      <Typography sx={{ px: 0.9, py: 0.55, fontSize: "0.82rem", fontWeight: 800 }}>{column.map}</Typography>
                      <Button
                        size="small"
                        disabled={!column.decks.length || (!useLocalOverride && (!canManage || savingSelection))}
                        onClick={() => {
                          const mapIds = column.decks.map((deck) => deck.id);
                          const allSelected = mapIds.every((id) => selectedDeckIds.includes(id));
                          void applySelectedDeckIds(allSelected
                            ? selectedDeckIds.filter((id) => !mapIds.includes(id))
                            : [...selectedDeckIds, ...mapIds]);
                        }}
                        sx={{ minWidth: 0, px: 0.8, textTransform: "none", fontSize: "0.7rem" }}
                      >
                        {column.decks.every((deck) => selectedDeckIds.includes(deck.id)) ? "Clear" : "Select"}
                      </Button>
                    </Stack>
                    {!column.decks.length && <Typography variant="caption" sx={{ display: "block", p: 0.9, opacity: 0.6 }}>No quickslots</Typography>}
                    {column.decks.map((deck) => {
                      const quickslot = quickslots.find((entry) => entry.map === column.map && entry.deckId === deck.id)?.slot;
                      return (
                        <Box key={deck.id} data-testid={`quickslot-deck-${deck.id}`} sx={{ px: 0.9, py: 0.6, borderTop: isLight ? "1px solid rgba(122, 143, 174, 0.2)" : "1px solid rgba(120, 146, 210, 0.2)", background: selectedDeckIds.includes(deck.id) ? (isLight ? "rgba(213, 226, 241, 0.4)" : "rgba(45, 66, 109, 0.2)") : "transparent" }}>
                          <FormControlLabel
                            control={<Checkbox size="small" checked={selectedDeckIds.includes(deck.id)} disabled={!useLocalOverride && (!canManage || savingSelection)} onChange={() => toggleDeckInMatrix(deck.id)} />}
                            label={`${quickslot ?? "-"} · ${deck.name}`}
                            sx={{ m: 0, width: "100%", "& .MuiFormControlLabel-label": { minWidth: 0, fontSize: "0.78rem", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }}
                          />
                          <Stack spacing={0.1} sx={{ pl: 3.8 }}>
                            {deck.rows.map((row) => (
                              <Typography
                                key={row.slot}
                                component="button"
                                type="button"
                                variant="caption"
                                title={[row.chassis, row.variant].filter(Boolean).join(" ")}
                                onClick={() => openMechInRepository(row)}
                                sx={{
                                  minWidth: 0,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  color: isLight ? "#405675" : "#d5e1ff",
                                  background: "none",
                                  border: 0,
                                  p: 0,
                                  textAlign: "left",
                                  cursor: "pointer",
                                  font: "inherit",
                                  "&:hover, &:focus-visible": { color: isLight ? "#b01859" : "#ff8ac5" },
                                }}
                              >
                                {mechLabelForRow(row, chassisCodeByName)}
                              </Typography>
                            ))}
                          </Stack>
                        </Box>
                      );
                    })}
                  </Box>
                ))}
              </Box>
            </Stack>
          </Paper>

          <TableContainer
            component={Paper}
            sx={{
              width: "100%",
              maxWidth: "100%",
              overflowX: "auto",
              border: isLight ? "1px solid rgba(114, 133, 162, 0.34)" : "1px solid rgba(130, 154, 217, 0.35)",
              background: isLight ? "rgba(236, 242, 249, 0.95)" : "rgba(11, 16, 33, 0.9)",
            }}
          >
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell rowSpan={2} sx={{ position: "sticky", left: 0, zIndex: 6, width: MATRIX_PRIMARY_COL_WIDTH, minWidth: MATRIX_PRIMARY_COL_WIDTH, background: isLight ? "rgba(227, 236, 247, 0.98)" : "rgba(15, 22, 43, 0.98)", fontWeight: 700 }}>Pilots</TableCell>
                  <TableCell rowSpan={2} sx={{ position: "sticky", left: MATRIX_PRIMARY_COL_WIDTH, zIndex: 6, width: MATRIX_ALT_COL_WIDTH, minWidth: MATRIX_ALT_COL_WIDTH, background: isLight ? "rgba(227, 236, 247, 0.98)" : "rgba(15, 22, 43, 0.98)", fontWeight: 700 }}>Alternates</TableCell>
                  <TableCell rowSpan={2} sx={{ position: "sticky", left: MATRIX_PRIMARY_COL_WIDTH + MATRIX_ALT_COL_WIDTH, zIndex: 6, width: MATRIX_STATUS_COL_WIDTH, minWidth: MATRIX_STATUS_COL_WIDTH, background: isLight ? "rgba(227, 236, 247, 0.98)" : "rgba(15, 22, 43, 0.98)", fontWeight: 700 }}>Slotted</TableCell>
                  <TableCell rowSpan={2} sx={{ position: "sticky", left: MATRIX_PRIMARY_COL_WIDTH + MATRIX_ALT_COL_WIDTH + MATRIX_STATUS_COL_WIDTH, zIndex: 6, width: MATRIX_PACK_COL_WIDTH, minWidth: MATRIX_PACK_COL_WIDTH, background: isLight ? "rgba(227, 236, 247, 0.98)" : "rgba(15, 22, 43, 0.98)", fontWeight: 700 }}>Pack</TableCell>
                  {selectedMapColumns.map((column) => (
                    <TableCell
                      key={column.map}
                      colSpan={column.decks.length}
                      align="center"
                      sx={{
                        py: 0.45,
                        background: isLight ? "rgba(227, 236, 247, 0.98)" : "rgba(15, 22, 43, 0.98)",
                        borderLeft: isLight ? "1px solid rgba(114, 133, 162, 0.34)" : "1px solid rgba(130, 154, 217, 0.35)",
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 800 }}>{column.map}</Typography>
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  {selectedMapColumns.flatMap((column) => column.decks.map((deck) => {
                    const quickslot = quickslots.find((entry) => entry.map === column.map && entry.deckId === deck.id)?.slot;
                    return (
                      <TableCell
                        key={deck.id}
                        sx={{
                          top: 29,
                          minWidth: 155,
                          py: 0.45,
                          background: isLight ? "rgba(220, 231, 243, 0.99)" : "rgba(19, 29, 53, 0.99)",
                          borderLeft: isLight ? "1px solid rgba(114, 133, 162, 0.24)" : "1px solid rgba(130, 154, 217, 0.24)",
                        }}
                      >
                        <Typography variant="caption" title={deck.name} sx={{ display: "block", maxWidth: 145, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {quickslot ?? "-"} · {deck.name}
                        </Typography>
                      </TableCell>
                    );
                  }))}
                </TableRow>
              </TableHead>
              <TableBody>
                {visiblePilotList.map((pilot) => {
                  const allAssignments = assignmentsByPilot.get(pilot) ?? [];
                  const hasPrimary = allAssignments.some((entry) => entry.isPrimary);
                  const hasAlternate = allAssignments.some((entry) => entry.isAlternate);
                  const stickyBg = isLight ? "rgba(236, 242, 249, 0.98)" : "rgba(11, 16, 33, 0.96)";

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
                          width: MATRIX_STATUS_COL_WIDTH,
                          minWidth: MATRIX_STATUS_COL_WIDTH,
                        }}
                      >
                        <Select
                          size="small"
                          fullWidth
                          value={slottedPilots[pilot] ?? pilot}
                          onChange={(event) => setSlottedPilots((previous) => ({ ...previous, [pilot]: event.target.value }))}
                          inputProps={{ "aria-label": `Slotted pilot for ${pilot}` }}
                          sx={{ fontSize: "0.78rem", "& .MuiSelect-select": { py: 0.55 } }}
                        >
                          {allPilots.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
                        </Select>
                      </TableCell>
                      <TableCell
                        sx={{
                          position: "sticky",
                          left: MATRIX_PRIMARY_COL_WIDTH + MATRIX_ALT_COL_WIDTH + MATRIX_STATUS_COL_WIDTH,
                          zIndex: 4,
                          background: stickyBg,
                          width: MATRIX_PACK_COL_WIDTH,
                          minWidth: MATRIX_PACK_COL_WIDTH,
                        }}
                      >
                        <Tooltip title={`Export ${pilot}'s build pack`}>
                          <Button size="small" variant="outlined" onClick={() => downloadPilotNightPack(pilot)} sx={{ minWidth: 32, p: 0.45 }} aria-label={`Export ${pilot} build pack`}>
                            <DownloadIcon fontSize="small" />
                          </Button>
                        </Tooltip>
                      </TableCell>

                      {selectedMapColumns.flatMap((column) => column.decks.map((deck) => {
                        const deckAssignments = allAssignments.filter((entry) => entry.deck.id === deck.id);
                        return (
                          <TableCell key={`${pilot}-${deck.id}`} sx={{ minWidth: 155 }}>
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
                                    <Stack
                                      key={`${pilot}-${entry.deck.id}-${entry.row.slot}-${entry.mechLabel}`}
                                      direction="row"
                                      spacing={0.6}
                                      sx={{ alignItems: "center", minWidth: 0, minHeight: 24 }}
                                    >
                                      <Tooltip title={roleTitle}>
                                        <CircleIcon sx={{ fontSize: "0.54rem", color: roleColor, flexShrink: 0 }} />
                                      </Tooltip>
                                      <Typography
                                        component="button"
                                        type="button"
                                        variant="body2"
                                        title={`${entry.deck.name} · ${entry.mechLabel}`}
                                        onClick={() => openMechInRepository(entry.row)}
                                        sx={{
                                          minWidth: 0,
                                          fontSize: "0.78rem",
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          color: "inherit",
                                          background: "none",
                                          border: 0,
                                          p: 0,
                                          textAlign: "left",
                                          cursor: "pointer",
                                          font: "inherit",
                                          "&:hover, &:focus-visible": { color: isLight ? "#b01859" : "#ff8ac5" },
                                        }}
                                      >
                                        {entry.mechLabel}
                                        {!entry.hasRepositoryData ? " *" : ""}
                                      </Typography>
                                    </Stack>
                                  );
                                })}
                              </Stack>
                            )}
                          </TableCell>
                        );
                      }))}
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
