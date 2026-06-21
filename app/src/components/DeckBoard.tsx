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
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { getMechHierarchy, getMechs } from "../api/client";
import { CS2026_ROUND1 } from "../data/decks";
import { useMatchNightApi } from "../hooks/useMatchNightApi";
import type {
  ChassisSummary,
  Drop as ApiDrop,
  MechDoc,
  MatchNightCreateInput,
  WeightClass as ApiWeightClass,
  WeightClass,
  WeightClassSummary,
} from "../types/contracts";

type EditMode = "view" | "edit";
type TeamSide = "Team 1" | "Team 2" | "Agnostic";
type AppView = 0 | 1;
type Lance = "A" | "B" | "C" | "";

type DeckRow = {
  slot: number;
  primary: string[];
  alternates: string[];
  lance: Lance;
  mech: string;
  role: string;
  weaponry: string;
  buildCode: string;
  skillTree: string;
  weightClass: WeightClass | "";
  tonnage: number | "";
};

type DeckTemplate = {
  id: string;
  name: string;
  map: string;
  side: TeamSide;
  strategy: string;
  rows: DeckRow[];
};

type VariantRecord = {
  code: string;
  displayName: string;
  weightClass: WeightClass;
  tonnage: number;
  builds: MechDoc[];
};

const MAP_OPTIONS = ["Alpine Peaks", "Bear Claw II", "Crimson Strait", "Frozen City", "TBD"];
const SIDE_OPTIONS: TeamSide[] = ["Team 1", "Team 2", "Agnostic"];
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

function toApiWeightClass(weightClass: WeightClass | ""): ApiWeightClass {
  if (weightClass === "Light" || weightClass === "Medium" || weightClass === "Heavy" || weightClass === "Assault") {
    return weightClass;
  }
  return "Medium";
}

function createEmptyRow(slot: number): DeckRow {
  return {
    slot,
    primary: [],
    alternates: [],
    lance: "",
    mech: "",
    role: "",
    weaponry: "",
    buildCode: "",
    skillTree: "",
    weightClass: "",
    tonnage: "",
  };
}

function createTemplate(map: string, side: TeamSide, version = 1): DeckTemplate {
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

export function DeckBoard() {
  const [appView, setAppView] = useState<AppView>(0);
  const [editMode, setEditMode] = useState<EditMode>("edit");
  const [selectedMap, setSelectedMap] = useState<string>(MAP_OPTIONS[0]);
  const [selectedSide, setSelectedSide] = useState<TeamSide>("Team 1");
  const [templates, setTemplates] = useState<DeckTemplate[]>(defaultTemplates);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [lastSavedId, setLastSavedId] = useState<string>("");
  const [loadId, setLoadId] = useState<string>("");
  const [mechs, setMechs] = useState<MechDoc[]>([]);
  const [mechLoading, setMechLoading] = useState(false);
  const [mechError, setMechError] = useState<string>("");
  const [repoHierarchy, setRepoHierarchy] = useState<WeightClassSummary[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState<string>("");
  const { isSaving, isLoading, error, saveMatchNight, loadMatchNight } = useMatchNightApi();

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

  const allVariants: VariantRecord[] = useMemo(() => {
    const variantBuckets = new Map<string, MechDoc[]>();
    for (const mech of mechs) {
      const key = mech.variant;
      const existing = variantBuckets.get(key) ?? [];
      existing.push(mech);
      variantBuckets.set(key, existing);
    }

    return Array.from(variantBuckets.entries())
      .map(([code, builds]) => ({
        code,
        displayName: builds[0]?.variant ?? code,
        weightClass: builds[0]?.class ?? "Medium",
        tonnage: builds[0]?.tonnage ?? getTonnage(builds[0]?.class ?? "Medium"),
        builds,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [mechs]);

  const variantLookup = useMemo(() => new Map(allVariants.map((variant) => [variant.code, variant])), [allVariants]);

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

  const applyVariantDefaults = (rowIndex: number, mechCode: string) => {
    const variant = variantLookup.get(mechCode);
    updateRow(rowIndex, (row) => {
      if (!variant) {
        return {
          ...row,
          mech: mechCode,
          role: "",
          weaponry: "",
          buildCode: "",
          skillTree: "",
          weightClass: "",
          tonnage: "",
        };
      }
      const firstBuild = variant.builds[0];
      return {
        ...row,
        mech: mechCode,
        role: firstBuild?.role ?? row.role,
        weaponry: firstBuild?.weaponry ?? row.weaponry,
        buildCode: firstBuild?.buildUrl ?? row.buildCode,
        skillTree: firstBuild?.skillCode ?? row.skillTree,
        weightClass: variant.weightClass,
        tonnage: variant.tonnage,
      };
    });
  };

  const applyBuildDefaults = (rowIndex: number, buildCode: string) => {
    const row = activeTemplate?.rows[rowIndex];
    const variant = row ? variantLookup.get(row.mech) : undefined;
    const build = variant?.builds.find((item) => item.buildUrl === buildCode);
    if (!build) return;

    updateRow(rowIndex, (entry) => ({
      ...entry,
      buildCode: build.buildUrl,
      role: build.role,
      weaponry: build.weaponry ?? entry.weaponry,
      skillTree: build.skillCode ?? entry.skillTree,
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

  const onMapChange = (map: string) => {
    setSelectedMap(map);
    const candidate = templates.find((template) => template.map === map && template.side === selectedSide);
    if (candidate) setSelectedTemplateId(candidate.id);
  };

  const onSideChange = (side: TeamSide) => {
    setSelectedSide(side);
    const candidate = templates.find((template) => template.map === selectedMap && template.side === side);
    if (candidate) setSelectedTemplateId(candidate.id);
  };

  const toApiPayload = (template: DeckTemplate): MatchNightCreateInput => {
    const drops: ApiDrop[] = [
      {
        dropNumber: 1,
        slots: template.rows.map((row) => ({
          slotId: `d1-s${row.slot}`,
          weightClass: toApiWeightClass(row.weightClass),
          chassis: row.mech || "Unknown",
          variant: row.mech || "Unknown",
          pilot: row.primary[0] ?? "Unassigned",
          candidatePilots: row.alternates,
          buildLink: row.buildCode.startsWith("http") ? row.buildCode : "https://example.com/build",
          skillCode: row.skillTree || "UNSET",
          role: row.role || "Generalist",
          keyFactors: {
            ecm: false,
            bap: false,
            jumpJets: false,
            speedKph: 0,
          },
          isBackup: false,
          notes: row.weaponry,
        })),
        mapLink: activeTemplate?.map ? `https://example.com/maps/${encodeURIComponent(activeTemplate.map)}` : "",
        locked: editMode === "view",
      },
    ];

    return {
      teamId: "exd8",
      seasonId: "season-2026-spring",
      date: new Date().toISOString().slice(0, 10),
      round: 1,
      opponent: "TBD",
      drops,
    };
  };

  const applyLoadedMatchNight = (loaded: { drops: ApiDrop[]; id: string }) => {
    if (!activeTemplateId) return;
    const firstDrop = loaded.drops[0];
    if (!firstDrop) return;

    setTemplates((previous) =>
      previous.map((template) => {
        if (template.id !== activeTemplateId) return template;
        return {
          ...template,
          rows: template.rows.map((row, idx) => {
            const slot = firstDrop.slots[idx];
            if (!slot) return row;
            return {
              ...row,
              mech: slot.variant,
              role: slot.role,
              weaponry: slot.notes,
              buildCode: slot.buildLink,
              skillTree: slot.skillCode,
              weightClass: slot.weightClass,
              tonnage: getTonnage(slot.weightClass),
              primary: slot.pilot ? [slot.pilot] : [],
              alternates: slot.candidatePilots,
            };
          }),
        };
      }),
    );

    setLastSavedId(loaded.id);
  };

  const handleSaveTemplate = async () => {
    if (!activeTemplate) return;
    const payload = toApiPayload(activeTemplate);
    const saved = await saveMatchNight(payload);
    if (saved) {
      setLastSavedId(saved.id);
      setLoadId(saved.id);
    }
  };

  const handleLoadTemplate = async () => {
    if (!loadId) return;
    const loaded = await loadMatchNight(loadId, "exd8");
    if (loaded) {
      applyLoadedMatchNight(loaded);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 8% 10%, rgba(167, 196, 255, 0.18), transparent 35%), radial-gradient(circle at 90% 0%, rgba(119, 140, 191, 0.18), transparent 40%), #0c101d",
        pb: 3,
      }}
    >
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          background: "rgba(9, 14, 28, 0.9)",
          borderBottom: "1px solid rgba(130, 154, 217, 0.32)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Toolbar sx={{ gap: 2, flexWrap: "wrap" }}>
          <Stack spacing={0.25} sx={{ mr: { xs: 0, md: 2 } }}>
            <Typography sx={{ color: "#eff5ff", fontWeight: 700 }}>{CS2026_ROUND1.season}</Typography>
            <Typography variant="caption" sx={{ color: "#aebddd" }}>
              Clean deck planner
            </Typography>
          </Stack>

          <Tabs
            value={appView}
            onChange={(_, value: AppView) => setAppView(value)}
            sx={{ "& .MuiTab-root": { color: "#cbd6f6", minHeight: 34 }, "& .Mui-selected": { color: "#ffffff" } }}
          >
            <Tab label="Deck Planner" value={0} />
            <Tab label="Mech Repository" value={1} />
          </Tabs>

          {appView === 0 && (
            <>
              <Tabs
                value={selectedMap}
                onChange={(_, value: string) => onMapChange(value)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ "& .MuiTab-root": { color: "#cbd6f6", minHeight: 34 }, "& .Mui-selected": { color: "#ffffff" } }}
              >
                {MAP_OPTIONS.map((map) => (
                  <Tab key={map} label={map} value={map} />
                ))}
              </Tabs>

              <Tabs
                value={selectedSide}
                onChange={(_, value: TeamSide) => onSideChange(value)}
                sx={{ "& .MuiTab-root": { color: "#cbd6f6", minHeight: 34 }, "& .Mui-selected": { color: "#ffffff" } }}
              >
                {SIDE_OPTIONS.map((side) => (
                  <Tab key={side} label={side} value={side} />
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

              <Button variant="contained" onClick={handleSaveTemplate} disabled={!activeTemplate || isSaving}>
                {isSaving ? "Saving..." : "Save to API"}
              </Button>

              <TextField
                size="small"
                label="Match ID"
                value={loadId}
                onChange={(event) => setLoadId(event.target.value)}
                sx={{ minWidth: 190 }}
              />

              <Button variant="outlined" onClick={handleLoadTemplate} disabled={!loadId || isLoading}>
                {isLoading ? "Loading..." : "Load from API"}
              </Button>
            </>
          )}

          <ButtonGroup size="small" sx={{ ml: { xs: 0, md: "auto" } }}>
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
            {lastSavedId && <Alert severity="success">Saved match night id: {lastSavedId}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.5fr 1fr" }, gap: 2 }}>
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 2,
              border: "1px solid rgba(130, 154, 217, 0.35)",
              background: "rgba(11, 16, 33, 0.9)",
            }}
          >
            <Typography sx={{ color: "#edf4ff", fontWeight: 700, mb: 1.2 }}>Strategy ({selectedSide})</Typography>
            <TextField
              variant="standard"
              fullWidth
              multiline
              minRows={11}
              placeholder="Write deployment plan, push timing, backup lines, and pilot assignments."
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
              border: "1px solid rgba(130, 154, 217, 0.35)",
              background: "linear-gradient(180deg, rgba(16, 27, 56, 0.88), rgba(10, 16, 32, 0.96))",
            }}
          >
            <Box
              sx={{
                minHeight: { xs: 320, lg: 520 },
                aspectRatio: "1 / 1",
                position: "relative",
                backgroundImage:
                  "linear-gradient(rgba(207,221,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(207,221,255,0.08) 1px, transparent 1px)",
                backgroundSize: "30px 30px",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  inset: 16,
                  borderRadius: 1.5,
                  border: "1px solid rgba(159, 178, 240, 0.24)",
                  background:
                    "radial-gradient(circle at 30% 30%, rgba(116, 156, 255, 0.28), transparent 42%), radial-gradient(circle at 72% 58%, rgba(153, 178, 231, 0.18), transparent 48%), rgba(6, 12, 26, 0.8)",
                }}
              />
            </Box>
          </Paper>
            </Box>

        <Paper
          elevation={0}
          sx={{
            borderRadius: 2,
            border: "1px solid rgba(130, 154, 217, 0.35)",
            background: "rgba(11, 16, 33, 0.92)",
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
              borderBottom: "1px solid rgba(130, 154, 217, 0.25)",
            }}
          >
            <Typography sx={{ color: "#eff4ff", fontWeight: 700 }}>
              Deck Table ({selectedMap} | {selectedSide})
            </Typography>
            <Typography sx={{ color: "#bfd0ff", fontWeight: 700 }}>Total Tonnage: {totalTonnage} t</Typography>
          </Box>

          <TableContainer sx={{ overflowX: "auto" }}>
            <Table
              size="medium"
              sx={{
                minWidth: 1700,
                "& .MuiTableCell-root": { borderBottom: "1px solid rgba(130, 154, 217, 0.14)", py: 1 },
                "& .MuiInputBase-root:before": { borderBottomColor: "rgba(170, 187, 233, 0.32)" },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: "#dce4ff", fontWeight: 700, minWidth: 220 }}>Primary</TableCell>
                  <TableCell sx={{ color: "#dce4ff", fontWeight: 700, minWidth: 220 }}>Alternates</TableCell>
                  <TableCell sx={{ color: "#dce4ff", fontWeight: 700, minWidth: 110 }}>Lance</TableCell>
                  <TableCell sx={{ color: "#dce4ff", fontWeight: 700, minWidth: 240 }}>Mech</TableCell>
                  <TableCell sx={{ color: "#dce4ff", fontWeight: 700, minWidth: 150 }}>Role</TableCell>
                  <TableCell sx={{ color: "#dce4ff", fontWeight: 700, minWidth: 210 }}>Weaponry</TableCell>
                  <TableCell sx={{ color: "#dce4ff", fontWeight: 700, minWidth: 170 }}>Build Code</TableCell>
                  <TableCell sx={{ color: "#dce4ff", fontWeight: 700, minWidth: 170 }}>Skill Tree</TableCell>
                  <TableCell sx={{ color: "#dce4ff", fontWeight: 700, minWidth: 140 }}>Weight Class</TableCell>
                  <TableCell sx={{ color: "#dce4ff", fontWeight: 700, minWidth: 110 }}>Tonnage</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeTemplate?.rows.map((row, rowIndex) => {
                  const variant = variantLookup.get(row.mech);
                  const roleOptions = variant?.builds.map((build) => build.role) ?? [];
                  const weaponryOptions = variant?.builds.map((build) => build.weaponry).filter(Boolean) as string[];
                  const buildCodeOptions = variant?.builds.map((build) => build.buildUrl) ?? [];
                  const skillTreeOptions = variant?.builds.map((build) => build.skillCode).filter(Boolean) as string[];

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
                            renderValue={(value) => ((value as string[]).length ? (value as string[]).join(", ") : "Primary pilots")}
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
                            renderValue={(value) => ((value as string[]).length ? (value as string[]).join(", ") : "Alternate pilots")}
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
                          <InputLabel>Mech Variant</InputLabel>
                          <Select
                            variant="standard"
                            label="Mech Variant"
                            value={row.mech}
                            disabled={editMode !== "edit"}
                            onChange={(event) => applyVariantDefaults(rowIndex, event.target.value)}
                          >
                            <MenuItem value="">
                              <em>None</em>
                            </MenuItem>
                            {allVariants.map((entry) => (
                              <MenuItem key={entry.code} value={entry.code}>
                                {entry.code} | {entry.displayName}
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
                          renderInput={(params) => <TextField {...params} variant="standard" placeholder="Role" />}
                        />
                      </TableCell>
                      <TableCell>
                        <Autocomplete
                          freeSolo
                          size="small"
                          options={weaponryOptions}
                          value={row.weaponry}
                          disabled={editMode !== "edit"}
                          onInputChange={(_, value) => updateRow(rowIndex, (entry) => ({ ...entry, weaponry: value }))}
                          renderInput={(params) => <TextField {...params} variant="standard" placeholder="Weaponry" />}
                        />
                      </TableCell>
                      <TableCell>
                        <Autocomplete
                          freeSolo
                          size="small"
                          options={buildCodeOptions}
                          value={row.buildCode}
                          disabled={editMode !== "edit"}
                          onChange={(_, value) => applyBuildDefaults(rowIndex, value ?? "")}
                          onInputChange={(_, value) => updateRow(rowIndex, (entry) => ({ ...entry, buildCode: value }))}
                          renderInput={(params) => <TextField {...params} variant="standard" placeholder="Build code" />}
                        />
                      </TableCell>
                      <TableCell>
                        <Autocomplete
                          freeSolo
                          size="small"
                          options={skillTreeOptions}
                          value={row.skillTree}
                          disabled={editMode !== "edit"}
                          onInputChange={(_, value) => updateRow(rowIndex, (entry) => ({ ...entry, skillTree: value }))}
                          renderInput={(params) => <TextField {...params} variant="standard" placeholder="Skill tree" />}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ color: "#d3ddfc" }}>{row.weightClass || "-"}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ color: "#d3ddfc" }}>{row.tonnage === "" ? "-" : `${row.tonnage}`}</Typography>
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
              border: "1px solid rgba(130, 154, 217, 0.35)",
              background: "rgba(11, 16, 33, 0.92)",
              overflow: "hidden",
            }}
          >
            <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid rgba(130, 154, 217, 0.25)" }}>
              <Typography sx={{ color: "#eff4ff", fontWeight: 700 }}>Tracked Mech Repository</Typography>
              <Typography variant="body2" sx={{ color: "#adbee9" }}>
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
                <Accordion key={summary.class} disableGutters elevation={0} sx={{ background: "rgba(13, 21, 42, 0.72)" }}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: "#dce4ff" }} />}>
                    <Typography sx={{ color: "#dce4ff", fontWeight: 700 }}>{classLabel(summary)}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Stack spacing={1}>
                      {summary.chassis.map((entry) => (
                        <Accordion
                          key={`${summary.class}-${entry.chassis}`}
                          disableGutters
                          elevation={0}
                          sx={{ background: "rgba(15, 25, 50, 0.72)" }}
                        >
                          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: "#cbd6f6" }} />}>
                            <Typography sx={{ color: "#cbd6f6", fontWeight: 600 }}>
                              {entry.chassis} ({entry.buildCount})
                            </Typography>
                          </AccordionSummary>
                          <AccordionDetails>
                            <Stack spacing={0.5}>
                              {entry.variants.map((variant) => (
                                <Typography key={`${entry.chassis}-${variant.variant}`} sx={{ color: "#adbee9" }}>
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
