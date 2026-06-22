import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AppBar,
  Autocomplete,
  Box,
  Button,
  ButtonGroup,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Toolbar,
  Typography,
  Tooltip,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import { getDropDecks, getMechHierarchy, getMechs } from "../api/client";
import { CS2026_ROUND1 } from "../data/decks";
import { useMatchNightApi } from "../hooks/useMatchNightApi";
import type {
  ChassisSummary,
  DeckMap,
  DeckSide,
  DropDeckDoc,
  MechDoc,
  WeightClass,
  WeightClassSummary,
} from "../types/contracts";

type EditMode = "view" | "edit";
type TeamSide = DeckSide;
type AppView = 0 | 1;
type Lance = "A" | "B" | "C" | "";

type DeckRow = {
  slot: number;
  primary: string[];
  alternates: string[];
  lance: Lance;
  mech: string;
  role: string;
  loadout: string;
  buildCode: string;
  skillTree: string;
  weightClass: WeightClass | "";
  tonnage: number | "";
};

type DeckTemplate = {
  id: string;
  name: string;
  map: DeckMap;
  side: TeamSide;
  strategy: string;
  updatedAt?: string;
  rows: DeckRow[];
};

type MechOption = {
  code: string;
  label: string;
  chassis: string;
  variant: string;
  weightClass: WeightClass;
  tonnage: number;
  builds: MechDoc[];
};

type LegacyDeckRow = Partial<DeckRow> & {
  weaponry?: string;
};

type DeckBoardProps = {
  mode: "light" | "dark";
  onToggleMode: () => void;
};

const MAP_OPTIONS: DeckMap[] = ["Alpine Peaks", "Bear Claw II", "Crimson Strait", "Frozen City", "River City"];
const SIDE_OPTIONS: TeamSide[] = ["1", "2", "either"];
const ROW_COUNT = 8;
const LANCE_OPTIONS: Lance[] = ["", "A", "B", "C"];

const PILOT_OPTIONS = [
  "Extra_Better",
  "Saikyou",
  "ChapDude",
  "Itsalrightwithme",
  "GrillSquad",
  "Xiphias",
  "Rabbid0Squirrel",
  "NeirSolon",
];

function getTonnage(weightClass: WeightClass): number {
  switch (weightClass) {
    case "Light":
      return 30;
    case "Medium":
      return 50;
    case "Heavy":
      return 70;
    case "Assault":
      return 90;
    default:
      return 0;
  }
}

function createEmptyRow(slot: number): DeckRow {
  return {
    slot,
    primary: [],
    alternates: [],
    lance: "",
    mech: "",
    role: "",
    loadout: "",
    buildCode: "",
    skillTree: "",
    weightClass: "",
    tonnage: "",
  };
}

function createTemplate(map: DeckMap, side: TeamSide, version = 1): DeckTemplate {
  return {
    id: `${map}-${side}-${version}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `${map} ${side} v${version}`,
    map,
    side,
    strategy: "",
    rows: Array.from({ length: ROW_COUNT }, (_, idx) => createEmptyRow(idx + 1)),
  };
}

function defaultTemplates(): DeckTemplate[] {
  return MAP_OPTIONS.flatMap((map) => SIDE_OPTIONS.map((side) => createTemplate(map, side, 1)));
}

function normalizeRow(slot: number, row?: LegacyDeckRow): DeckRow {
  return {
    slot,
    primary: row?.primary ?? [],
    alternates: row?.alternates ?? [],
    lance: row?.lance ?? "",
    mech: row?.mech ?? "",
    role: row?.role ?? "",
    loadout: row?.loadout ?? row?.weaponry ?? "",
    buildCode: row?.buildCode ?? "",
    skillTree: row?.skillTree ?? "",
    weightClass: row?.weightClass ?? "",
    tonnage: row?.tonnage ?? "",
  };
}

function toTemplate(doc: DropDeckDoc): DeckTemplate {
  const rows = Array.from({ length: ROW_COUNT }, (_, idx) => {
    const row = doc.deck.find((entry) => entry.slot === idx + 1);
    return normalizeRow(idx + 1, row);
  });

  return {
    id: doc.id,
    name: doc.name,
    map: doc.map,
    side: doc.side === "Team 1" ? "1" : doc.side === "Team 2" ? "2" : doc.side === "Agnostic" ? "either" : doc.side,
    strategy: doc.strategy ?? "",
    updatedAt: doc.updatedAt,
    rows,
  };
}

function sideLabel(side: TeamSide): string {
  return side === "either" ? "Either" : side;
}

function formatUpdatedAt(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export function DeckBoard({ mode, onToggleMode }: DeckBoardProps) {
  const isLight = mode === "light";

  const [appView, setAppView] = useState<AppView>(0);
  const [editMode, setEditMode] = useState<EditMode>("edit");
  const [selectedMap, setSelectedMap] = useState<DeckMap>(MAP_OPTIONS[0]);
  const [selectedSide, setSelectedSide] = useState<TeamSide>("1");
  const [templates, setTemplates] = useState<DeckTemplate[]>(defaultTemplates);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckError, setDeckError] = useState("");
  const [mechs, setMechs] = useState<MechDoc[]>([]);
  const [mechLoading, setMechLoading] = useState(false);
  const [mechError, setMechError] = useState<string>("");
  const [repoHierarchy, setRepoHierarchy] = useState<WeightClassSummary[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState<string>("");
  const { error } = useMatchNightApi();

  useEffect(() => {
    let cancelled = false;
    setMechLoading(true);
    setMechError("");

    getMechs()
      .then((data) => {
        if (!cancelled) setMechs(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setMechError(err instanceof Error ? err.message : "Failed to load mechs");
      })
      .finally(() => {
        if (!cancelled) setMechLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (appView !== 0) return;

    let cancelled = false;
    setDeckLoading(true);
    setDeckError("");

    getDropDecks()
      .then((docs) => {
        if (cancelled) return;

        if (!docs.length) {
          setTemplates(defaultTemplates());
          setSelectedTemplateId("");
          return;
        }

        const mapped = docs.map((doc) => toTemplate(doc));
        setTemplates(mapped);
        setSelectedMap(mapped[0].map);
        setSelectedSide(mapped[0].side);
        setSelectedTemplateId(mapped[0].id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load drop decks";
        const looksLikeNetworkError = /NetworkError|Failed to fetch|Load failed/i.test(message);
        setDeckError(looksLikeNetworkError ? "" : message);
        setTemplates(defaultTemplates());
      })
      .finally(() => {
        if (!cancelled) setDeckLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appView]);

  const mechOptions: MechOption[] = useMemo(() => {
    const variantBuckets = new Map<string, MechDoc[]>();
    for (const mech of mechs) {
      const key = `${mech.chassis}::${mech.variant}`;
      const existing = variantBuckets.get(key) ?? [];
      existing.push(mech);
      variantBuckets.set(key, existing);
    }

    return Array.from(variantBuckets.entries())
      .map(([code, builds]) => ({
        code,
        label: `${builds[0]?.chassis ?? "Unknown"} ${builds[0]?.variant ?? code}`,
        chassis: builds[0]?.chassis ?? "",
        variant: builds[0]?.variant ?? "",
        weightClass: builds[0]?.class ?? "Medium",
        tonnage: builds[0]?.tonnage ?? getTonnage(builds[0]?.class ?? "Medium"),
        builds,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [mechs]);

  const mechLookup = useMemo(() => new Map(mechOptions.map((option) => [option.code, option])), [mechOptions]);

  useEffect(() => {
    if (appView !== 1) return;

    let cancelled = false;
    setRepoLoading(true);
    setRepoError("");

    getMechHierarchy()
      .then((data) => {
        if (!cancelled) setRepoHierarchy(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setRepoError(err instanceof Error ? err.message : "Failed to load repository hierarchy");
      })
      .finally(() => {
        if (!cancelled) setRepoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appView]);

  const classLabel = (summary: WeightClassSummary): string => {
    const chassis = summary.chassis
      .map((entry: ChassisSummary) => `${entry.chassis} (${entry.buildCount})`)
      .join(", ");
    return `${summary.class}: ${chassis || "No entries"}`;
  };

  const templatesForSelection = useMemo(
    () => templates.filter((template) => template.map === selectedMap && template.side === selectedSide),
    [templates, selectedMap, selectedSide],
  );

  useEffect(() => {
    if (!templatesForSelection.length) return;
    const exists = templatesForSelection.some((template) => template.id === selectedTemplateId);
    if (!exists) setSelectedTemplateId(templatesForSelection[0].id);
  }, [templatesForSelection, selectedTemplateId]);

  const activeTemplate =
    templatesForSelection.find((template) => template.id === selectedTemplateId) ?? templatesForSelection[0];

  const activeTemplateId = activeTemplate?.id ?? "";

  const totalTonnage = useMemo(
    () => activeTemplate?.rows.reduce((sum, row) => sum + (typeof row.tonnage === "number" ? row.tonnage : 0), 0) ?? 0,
    [activeTemplate],
  );

  const updateActiveTemplate = (updater: (template: DeckTemplate) => DeckTemplate) => {
    if (!activeTemplateId) return;
    setTemplates((previous) => previous.map((template) => (template.id === activeTemplateId ? updater(template) : template)));
  };

  const updateRow = (rowIndex: number, updater: (row: DeckRow) => DeckRow) => {
    updateActiveTemplate((template) => ({
      ...template,
      rows: template.rows.map((row, idx) => (idx === rowIndex ? updater(row) : row)),
    }));
  };

  const applyMechDefaults = (rowIndex: number, mechCode: string) => {
    const mechOption = mechLookup.get(mechCode);
    updateRow(rowIndex, (row) => {
      if (!mechOption) {
        return {
          ...row,
          mech: mechCode,
          loadout: "",
          role: "",
          buildCode: "",
          skillTree: "",
          weightClass: "",
          tonnage: "",
        };
      }
      const firstBuild = mechOption.builds[0];
      return {
        ...row,
        mech: mechCode,
        loadout: firstBuild?.weaponry ?? "",
        role: firstBuild?.role ?? row.role,
        buildCode: firstBuild?.buildUrl ?? row.buildCode,
        skillTree: firstBuild?.skillCode ?? row.skillTree,
        weightClass: mechOption.weightClass,
        tonnage: mechOption.tonnage,
      };
    });
  };

  const applyLoadoutDefaults = (rowIndex: number, loadout: string) => {
    const row = activeTemplate?.rows[rowIndex];
    const mechOption = row ? mechLookup.get(row.mech) : undefined;
    const build = mechOption?.builds.find((item) => item.weaponry === loadout);
    if (!build) return;

    updateRow(rowIndex, (entry) => ({
      ...entry,
      loadout: build.weaponry ?? loadout,
      buildCode: build.buildUrl,
      role: build.role,
      skillTree: build.skillCode ?? entry.skillTree,
      weightClass: build.class,
      tonnage: build.tonnage,
    }));
  };

  const getVisibleAlternates = (row: DeckRow): string[] =>
    row.alternates.filter((pilot) => !row.primary.includes(pilot));

  const setPrimaryPilots = (rowIndex: number, primary: string[]) => {
    updateRow(rowIndex, (entry) => ({ ...entry, primary }));
  };

  const setAlternatePilots = (rowIndex: number, alternatesVisible: string[]) => {
    updateRow(rowIndex, (entry) => {
      const hiddenDesignated = entry.alternates.filter((pilot) => entry.primary.includes(pilot));
      return { ...entry, alternates: Array.from(new Set([...alternatesVisible, ...hiddenDesignated])) };
    });
  };

  const createTemplateCopy = () => {
    if (!activeTemplate) return;
    const version =
      templates.filter((template) => template.map === selectedMap && template.side === selectedSide).length + 1;
    const copy: DeckTemplate = {
      ...activeTemplate,
      id: `${activeTemplate.id}-copy-${Date.now()}`,
      name: `${selectedMap} ${selectedSide} v${version}`,
      rows: activeTemplate.rows.map((row) => ({ ...row, primary: [...row.primary], alternates: [...row.alternates] })),
    };
    setTemplates((previous) => [...previous, copy]);
    setSelectedTemplateId(copy.id);
  };

  const createFreshTemplate = () => {
    const version =
      templates.filter((template) => template.map === selectedMap && template.side === selectedSide).length + 1;
    const fresh = createTemplate(selectedMap, selectedSide, version);
    setTemplates((previous) => [...previous, fresh]);
    setSelectedTemplateId(fresh.id);
  };

  const onMapChange = (map: DeckMap) => {
    setSelectedMap(map);
    const candidate = templates.find((template) => template.map === map && template.side === selectedSide);
    if (candidate) setSelectedTemplateId(candidate.id);
  };

  const onSideChange = (side: TeamSide) => {
    setSelectedSide(side);
    const candidate = templates.find((template) => template.map === selectedMap && template.side === side);
    if (candidate) setSelectedTemplateId(candidate.id);
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
        <Toolbar sx={{ gap: 2, flexWrap: "wrap" }}>
          <Stack spacing={0.25} sx={{ mr: { xs: 0, md: 2 } }}>
            <Typography sx={{ color: isLight ? "#2f3e58" : "#eff5ff", fontWeight: 700 }}>{CS2026_ROUND1.season}</Typography>
          </Stack>

          <Tabs
            value={appView}
            onChange={(_, value: AppView) => setAppView(value)}
            sx={{
              "& .MuiTab-root": { color: isLight ? "#566987" : "#cbd6f6", minHeight: 34 },
              "& .Mui-selected": { color: isLight ? "#26364f" : "#ffffff" },
            }}
          >
            <Tab label="Deck Planner" value={0} />
            <Tab label="Mech Repository" value={1} />
          </Tabs>

          {appView === 0 && (
            <>
              <Tabs
                value={selectedMap}
                onChange={(_, value: DeckMap) => onMapChange(value)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  "& .MuiTab-root": { color: isLight ? "#566987" : "#cbd6f6", minHeight: 34 },
                  "& .Mui-selected": { color: isLight ? "#26364f" : "#ffffff" },
                }}
              >
                {MAP_OPTIONS.map((map) => (
                  <Tab key={map} label={map} value={map} />
                ))}
              </Tabs>

              <Tabs
                value={selectedSide}
                onChange={(_, value: TeamSide) => onSideChange(value)}
                sx={{
                  "& .MuiTab-root": { color: isLight ? "#566987" : "#cbd6f6", minHeight: 34 },
                  "& .Mui-selected": { color: isLight ? "#26364f" : "#ffffff" },
                }}
              >
                {SIDE_OPTIONS.map((side) => (
                  <Tab key={side} label={sideLabel(side)} value={side} />
                ))}
              </Tabs>

              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel>Deck Template</InputLabel>
                <Select
                  label="Deck Template"
                  value={activeTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                >
                  {templatesForSelection.map((template) => (
                    <MenuItem key={template.id} value={template.id}>
                      {template.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button variant="outlined" onClick={createTemplateCopy}>
                Copy this template
              </Button>

              <Button variant="outlined" onClick={createFreshTemplate}>
                Fresh template
              </Button>
            </>
          )}

          <ButtonGroup
            size="small"
            sx={{
              ml: { xs: 0, md: "auto" },
              borderRadius: 1.5,
              overflow: "hidden",
              boxShadow: isLight ? "0 0 0 1px rgba(108, 128, 158, 0.35)" : "0 0 0 1px rgba(130, 154, 217, 0.28)",
              "& .MuiButton-root": {
                borderColor: isLight ? "rgba(108, 128, 158, 0.35)" : "rgba(130, 154, 217, 0.32)",
              },
            }}
          >
            <Tooltip title={isLight ? "Switch to dark mode" : "Switch to light mode"}>
              <Button
                variant="outlined"
                onClick={onToggleMode}
                aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
                sx={{ minWidth: 40, px: 1.1 }}
              >
                {isLight ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
              </Button>
            </Tooltip>
            <Button variant={editMode === "view" ? "contained" : "outlined"} onClick={() => setEditMode("view")}>
              View
            </Button>
            <Button variant={editMode === "edit" ? "contained" : "outlined"} onClick={() => setEditMode("edit")}>
              Edit
            </Button>
          </ButtonGroup>
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ pt: 2, px: { xs: 1, md: 2 } }}>
        {appView === 0 && (
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            {deckError && <Alert severity="error">{deckError}</Alert>}
            {deckLoading && <Alert severity="info">Loading drop decks...</Alert>}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.5fr 1fr" }, gap: 2 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 2,
              border: isLight ? "1px solid rgba(114, 133, 162, 0.34)" : "1px solid rgba(130, 154, 217, 0.35)",
              background: isLight ? "rgba(236, 242, 249, 0.95)" : "rgba(11, 16, 33, 0.9)",
            }}
          >
            <Typography sx={{ color: isLight ? "#2f3f59" : "#edf4ff", fontWeight: 700, mb: 1.2 }}>Strategy ({selectedSide})</Typography>
            <TextField
              variant="standard"
              fullWidth
              multiline
              minRows={11}
              placeholder="Dropdeck description."
              value={activeTemplate?.strategy ?? ""}
              disabled={editMode !== "edit"}
              onChange={(event) =>
                updateActiveTemplate((template) => ({
                  ...template,
                  strategy: event.target.value,
                }))
              }
            />
          </Paper>

          <Paper
            elevation={0}
            sx={{
              borderRadius: 2,
              overflow: "hidden",
              border: isLight ? "1px solid rgba(114, 133, 162, 0.34)" : "1px solid rgba(130, 154, 217, 0.35)",
              background: isLight
                ? "linear-gradient(180deg, rgba(227, 234, 244, 0.9), rgba(218, 227, 239, 0.97))"
                : "linear-gradient(180deg, rgba(16, 27, 56, 0.88), rgba(10, 16, 32, 0.96))",
            }}
          >
            <Box
              sx={{
                minHeight: { xs: 320, lg: 520 },
                aspectRatio: "1 / 1",
                position: "relative",
                backgroundImage:
                  isLight
                    ? "linear-gradient(rgba(99,119,148,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(99,119,148,0.16) 1px, transparent 1px)"
                    : "linear-gradient(rgba(207,221,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(207,221,255,0.08) 1px, transparent 1px)",
                backgroundSize: "30px 30px",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  inset: 16,
                  borderRadius: 1.5,
                  border: isLight ? "1px solid rgba(101, 122, 153, 0.34)" : "1px solid rgba(159, 178, 240, 0.24)",
                  background: isLight
                    ? "radial-gradient(circle at 30% 30%, rgba(123, 144, 172, 0.34), transparent 42%), radial-gradient(circle at 72% 58%, rgba(156, 171, 192, 0.26), transparent 48%), rgba(205, 216, 230, 0.85)"
                    : "radial-gradient(circle at 30% 30%, rgba(116, 156, 255, 0.28), transparent 42%), radial-gradient(circle at 72% 58%, rgba(153, 178, 231, 0.18), transparent 48%), rgba(6, 12, 26, 0.8)",
                }}
              />
            </Box>
          </Paper>
            </Box>

        <Paper
          elevation={0}
          sx={{
            borderRadius: 2,
            border: isLight ? "1px solid rgba(114, 133, 162, 0.34)" : "1px solid rgba(130, 154, 217, 0.35)",
            background: isLight ? "rgba(235, 242, 249, 0.95)" : "rgba(11, 16, 33, 0.92)",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              px: 2,
              py: 1.4,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
              borderBottom: isLight ? "1px solid rgba(114, 133, 162, 0.3)" : "1px solid rgba(130, 154, 217, 0.25)",
            }}
          >
            <Stack spacing={0.2}>
              <Typography sx={{ color: isLight ? "#2f3f59" : "#eff4ff", fontWeight: 700 }}>
                Deck Table ({selectedMap} | {sideLabel(selectedSide)})
              </Typography>
              <Typography variant="body2" sx={{ color: isLight ? "#556887" : "#bfd0ff" }}>
                {activeTemplate?.name || "Unnamed dropdeck"}
                {formatUpdatedAt(activeTemplate?.updatedAt) ? ` | Updated ${formatUpdatedAt(activeTemplate?.updatedAt)}` : ""}
              </Typography>
            </Stack>
            <Typography sx={{ color: isLight ? "#556887" : "#bfd0ff", fontWeight: 700 }}>Total Tonnage: {totalTonnage} t</Typography>
          </Box>

          <TableContainer sx={{ overflowX: "auto" }}>
            <Table
              size="medium"
              sx={{
                minWidth: 1700,
                "& .MuiTableCell-root": {
                  borderBottom: isLight ? "1px solid rgba(114, 133, 162, 0.22)" : "1px solid rgba(130, 154, 217, 0.14)",
                  py: 1,
                },
                "& .MuiInputBase-root:before": {
                  borderBottomColor: isLight ? "rgba(108, 128, 158, 0.5)" : "rgba(170, 187, 233, 0.32)",
                },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 220 }}>Primary</TableCell>
                  <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 220 }}>Alternates</TableCell>
                  <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 110 }}>Lance</TableCell>
                  <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 240 }}>Mech</TableCell>
                  <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 150 }}>Role</TableCell>
                  <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 210 }}>Loadout</TableCell>
                  <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 170 }}>Build Code</TableCell>
                  <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 170 }}>Skill Tree</TableCell>
                  <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 140 }}>Weight Class</TableCell>
                  <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 110 }}>Tonnage</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeTemplate?.rows.map((row, rowIndex) => {
                  const mechOption = mechLookup.get(row.mech);
                  const roleOptions = Array.from(new Set((mechOption?.builds.map((build) => build.role) ?? []).filter(Boolean)));
                  const loadoutOptions = Array.from(new Set((mechOption?.builds.map((build) => build.weaponry) ?? []).filter(Boolean)));

                  return (
                    <TableRow key={row.slot} hover>
                      <TableCell>
                        <FormControl size="small" fullWidth variant="standard">
                          <Select
                            multiple
                            variant="standard"
                            value={row.primary}
                            displayEmpty
                            disabled={editMode !== "edit"}
                            onChange={(event) => setPrimaryPilots(rowIndex, event.target.value as string[])}
                            renderValue={(value) => ((value as string[]).length ? (value as string[]).join(", ") : "")}
                          >
                            {PILOT_OPTIONS.map((pilot) => (
                              <MenuItem key={pilot} value={pilot}>
                                {pilot}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell>
                        <FormControl size="small" fullWidth variant="standard">
                          <Select
                            multiple
                            variant="standard"
                            value={getVisibleAlternates(row)}
                            displayEmpty
                            disabled={editMode !== "edit"}
                            onChange={(event) => setAlternatePilots(rowIndex, event.target.value as string[])}
                            renderValue={(value) => ((value as string[]).length ? (value as string[]).join(", ") : "")}
                          >
                            {PILOT_OPTIONS.map((pilot) => (
                              <MenuItem key={pilot} value={pilot}>
                                {pilot}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell>
                        <FormControl size="small" fullWidth variant="standard">
                          <Select
                            variant="standard"
                            value={row.lance}
                            displayEmpty
                            disabled={editMode !== "edit"}
                            onChange={(event) => updateRow(rowIndex, (entry) => ({ ...entry, lance: event.target.value as Lance }))}
                            renderValue={(value) => (value ? value : "-")}
                          >
                            {LANCE_OPTIONS.map((lane) => (
                              <MenuItem key={`lance-${lane || "none"}`} value={lane}>
                                {lane || "-"}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell>
                        <FormControl size="small" fullWidth variant="standard">
                          <Select
                            variant="standard"
                            value={row.mech}
                            disabled={editMode !== "edit"}
                            onChange={(event) => applyMechDefaults(rowIndex, event.target.value)}
                          >
                            <MenuItem value="">
                              <em>None</em>
                            </MenuItem>
                            {mechOptions.map((entry) => (
                              <MenuItem key={entry.code} value={entry.code}>
                                {entry.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell>
                        <Autocomplete
                          freeSolo
                          size="small"
                          options={roleOptions}
                          value={row.role}
                          disabled={editMode !== "edit"}
                          onInputChange={(_, value) => updateRow(rowIndex, (entry) => ({ ...entry, role: value }))}
                          renderInput={(params) => <TextField {...params} variant="standard" />}
                        />
                      </TableCell>
                      <TableCell>
                        <Autocomplete
                          freeSolo
                          size="small"
                          options={loadoutOptions}
                          value={row.loadout}
                          disabled={editMode !== "edit"}
                          onChange={(_, value) => applyLoadoutDefaults(rowIndex, value ?? "")}
                          onInputChange={(_, value) => updateRow(rowIndex, (entry) => ({ ...entry, loadout: value }))}
                          renderInput={(params) => <TextField {...params} variant="standard" />}
                        />
                      </TableCell>
                      <TableCell>
                        <Autocomplete
                          freeSolo
                          size="small"
                          options={[]}
                          value={row.buildCode}
                          disabled
                          renderInput={(params) => <TextField {...params} variant="standard" />}
                        />
                      </TableCell>
                      <TableCell>
                        <Autocomplete
                          freeSolo
                          size="small"
                          options={[]}
                          value={row.skillTree}
                          disabled
                          renderInput={(params) => <TextField {...params} variant="standard" />}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ color: isLight ? "#4f6282" : "#d3ddfc" }}>
                          {row.weightClass && typeof row.tonnage === "number" ? `${row.tonnage}T | ${row.weightClass}` : row.weightClass || "-"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ color: isLight ? "#4f6282" : "#d3ddfc" }}>{row.tonnage === "" ? "-" : `${row.tonnage}`}</Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
          </Stack>
        )}

        {appView === 1 && (
          <Paper
            elevation={0}
            sx={{
              borderRadius: 2,
              border: isLight ? "1px solid rgba(114, 133, 162, 0.34)" : "1px solid rgba(130, 154, 217, 0.35)",
              background: isLight ? "rgba(235, 242, 249, 0.95)" : "rgba(11, 16, 33, 0.92)",
              overflow: "hidden",
            }}
          >
            <Box sx={{ px: 2, py: 1.5, borderBottom: isLight ? "1px solid rgba(114, 133, 162, 0.3)" : "1px solid rgba(130, 154, 217, 0.25)" }}>
              <Typography sx={{ color: isLight ? "#2f3f59" : "#eff4ff", fontWeight: 700 }}>Tracked Mech Repository</Typography>
              <Typography variant="body2" sx={{ color: isLight ? "#5f7191" : "#adbee9" }}>
                Foam/Cosmos source of truth only. Legacy static mech list is excluded.
              </Typography>
            </Box>

            <Stack spacing={1.25} sx={{ p: 1.5 }}>
              {mechError && <Alert severity="error">{mechError}</Alert>}
              {mechLoading && <Alert severity="info">Loading mech documents...</Alert>}
              {repoError && <Alert severity="error">{repoError}</Alert>}
              {repoLoading && <Alert severity="info">Loading repository hierarchy...</Alert>}
              {!repoLoading && !repoHierarchy.length && !repoError && (
                <Alert severity="info">No mech documents found in Cosmos yet.</Alert>
              )}

              {repoHierarchy.map((summary) => (
                <Accordion key={summary.class} disableGutters elevation={0} sx={{ background: isLight ? "rgba(233, 239, 247, 0.85)" : "rgba(13, 21, 42, 0.72)" }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: isLight ? "#4b607f" : "#dce4ff" }} />}>
                    <Typography sx={{ color: isLight ? "#3a4e6d" : "#dce4ff", fontWeight: 700 }}>{classLabel(summary)}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={1}>
                      {summary.chassis.map((entry) => (
                        <Accordion
                          key={`${summary.class}-${entry.chassis}`}
                          disableGutters
                          elevation={0}
                          sx={{ background: isLight ? "rgba(226, 234, 244, 0.88)" : "rgba(15, 25, 50, 0.72)" }}
                        >
                          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: isLight ? "#4f6382" : "#cbd6f6" }} />}>
                            <Typography sx={{ color: isLight ? "#4f6382" : "#cbd6f6", fontWeight: 600 }}>
                              {entry.chassis} ({entry.buildCount})
                            </Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <Stack spacing={0.5}>
                              {entry.variants.map((variant) => (
                                <Typography key={`${entry.chassis}-${variant.variant}`} sx={{ color: isLight ? "#5d7191" : "#adbee9" }}>
                                  {variant.variant}: {variant.buildCount} build{variant.buildCount === 1 ? "" : "s"}
                                </Typography>
                              ))}
                            </Stack>
                          </AccordionDetails>
                        </Accordion>
                      ))}
                    </Stack>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Stack>
          </Paper>
        )}
      </Container>
    </Box>
  );
}
