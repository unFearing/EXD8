import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AppBar,
  Autocomplete,
  Box,
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Chip,
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
import { animate, stagger } from "animejs";
import { CS2026_ROUND1, type DropSlot } from "../data/decks";
import {
  MECH_DATABASE,
  findVariantByCode,
  type MechBuild,
  type MechVariant,
  type WeightClass,
} from "../data/mechs";

type AppView = 0 | 1;
type EditMode = "view" | "edit";
type Lance = "A" | "B" | "C" | "";
type ClassTab = "Light" | "Medium" | "Heavy" | "Assault";

type DeckRow = DropSlot & {
  map: string;
  lance: Lance;
  strategy: string;
  strategyFactors: string;
  notes: string;
};

type DeckDrop = {
  dropNumber: number;
  name: string;
  gameMode: string;
  map: string;
  slots: DeckRow[];
};

type VariantRecord = MechVariant & {
  chassisId: string;
  chassisName: string;
};

const WEIGHT_CLASSES: WeightClass[] = ["Light", "Medium", "Heavy", "Assault", "Commander"];
const CLASS_TABS: ClassTab[] = ["Light", "Medium", "Heavy", "Assault"];
const LANCE_OPTIONS: Lance[] = ["", "A", "B", "C"];
const GRID_COLUMNS = 12;

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

const NAV_ALPHA_CHASSIS_BY_CLASS: Record<ClassTab, string[]> = {
  Light: ["Adder", "Arctic Cheetah", "Commando", "Cougar", "Firemoth", "Firestarter", "Flea", "Incubus", "Jenner", "Jenner IIC", "Javelin", "Kit Fox", "Locust", "Mist Lynx", "Osiris", "Panther", "Piranha", "Raven", "Spider", "Urbanmech", "Urbanmech IIC", "Wolfhound"],
  Medium: ["Arctic Wolf", "Assassin", "Black Lanner", "Blackjack", "Bushwacker", "Centurion", "Cicada", "Crab", "Dervish", "Enforcer", "Gauntlet", "Griffin", "Hatchetman", "Hellspawn", "Hunchback", "Hunchback IIC", "Huntsman", "Ice Ferret", "Kintaro", "Nova", "Phoenix Hawk", "Shadow Cat", "Shadowhawk", "Stormcrow", "Trebuchet", "Uziel", "Vapor Eagle", "Vindicator", "Viper", "Vulcan", "Wolverine"],
  Heavy: ["Archer", "Cataphract", "Catapult", "Champion", "Crusader", "Dragon", "Ebon Jaguar", "Grasshopper", "Hellbringer", "Hellfire", "Jagermech", "Linebacker", "Mad Dog", "Marauder", "Night Gyr", "Nova Cat", "Orion", "Orion IIC", "Quickdraw", "Rifleman", "Rifleman IIC", "Roughneck", "Summoner", "Sunspider", "Thanatos", "Thunderbolt", "Timber Wolf", "Warhammer"],
  Assault: ["Annihilator", "Atlas", "Awesome", "Banshee", "Battlemaster", "Blood Asp", "Bullshark", "Charger", "Corsair", "Cyclops", "Dire Wolf", "Executioner", "Fafnir", "Gargoyle", "Hatamoto-Chi", "Highlander", "Highlander IIC", "King Crab", "Kodiak", "Longbow", "Mad Cat Mk II", "Marauder II", "Marauder IIC", "Mauler", "Nightstar", "Stalker", "Stone Rhino", "Supernova", "Victor", "Warhawk", "Zeus"],
};

const ALL_VARIANTS: VariantRecord[] = MECH_DATABASE.flatMap((chassis) =>
  chassis.variants.map((variant) => ({ ...variant, chassisId: chassis.id, chassisName: chassis.displayName })),
).sort((a, b) => a.code.localeCompare(b.code));

function normalizeVariantCode(code: string): string {
  return code.replace(/\s*\([^)]*\)\s*/g, "").replace(/\s+/g, " ").trim();
}

function splitCsv(value?: string): string[] {
  if (!value) return [];
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function joinCsv(values: string[]): string {
  return values.map((entry) => entry.trim()).filter(Boolean).join(", ");
}

function toVariantCode(slot: DropSlot): string {
  return slot.variant ? `${slot.mech}-${slot.variant}` : slot.mech;
}

function fromVariantCode(code: string): { mech: string; variant: string } {
  if (code.startsWith("MAD DOG-")) return { mech: "MAD DOG", variant: code.replace("MAD DOG-", "") };
  const dash = code.indexOf("-");
  if (dash < 0) return { mech: code, variant: "" };
  return { mech: code.slice(0, dash), variant: code.slice(dash + 1) };
}

function resolveVariant(slot: DropSlot): MechVariant | undefined {
  const full = toVariantCode(slot);
  const normalized = normalizeVariantCode(full);
  return findVariantByCode(full) || findVariantByCode(normalized) || ALL_VARIANTS.find((variant) => normalizeVariantCode(variant.code) === normalized);
}

function laneForIndex(index: number): Lance {
  if (index <= 2) return "A";
  if (index <= 5) return "B";
  return "C";
}

export function DeckBoard() {
  const [appView, setAppView] = useState<AppView>(0);
  const [editMode, setEditMode] = useState<EditMode>("edit");
  const [activeDropIndex, setActiveDropIndex] = useState(0);
  const [repoClass, setRepoClass] = useState<ClassTab>("Light");
  const [repoQuery, setRepoQuery] = useState("");
  const [drops, setDrops] = useState<DeckDrop[]>(() =>
    CS2026_ROUND1.drops.map((drop) => ({
      ...drop,
      slots: drop.slots.map((slot, idx) => ({ ...slot, map: drop.map, lance: laneForIndex(idx), strategy: "", strategyFactors: "", notes: "" })),
    })),
  );

  const heroRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef<Record<string, HTMLElement | null>>({});
  const activeDrop = drops[activeDropIndex];

  const filteredVariants = useMemo(() => {
    const query = repoQuery.trim().toLowerCase();
    return ALL_VARIANTS.filter((variant) => {
      if (variant.weightClass !== repoClass) return false;
      if (!query) return true;
      const blob = [variant.code, variant.displayName, variant.chassisId, variant.chassisName, ...variant.builds.map((build) => `${build.name} ${build.role} ${build.skillCode ?? ""}`)].join(" ").toLowerCase();
      return blob.includes(query);
    });
  }, [repoClass, repoQuery]);

  useEffect(() => {
    if (!heroRef.current) return;
    animate(heroRef.current, { opacity: [0, 1], y: [14, 0], duration: 450, ease: "out(3)" });
  }, []);

  useEffect(() => {
    animate(appView === 0 ? ".deck-row" : ".repo-card", { opacity: [0, 1], y: [14, 0], delay: stagger(25), duration: 380, ease: "out(2)" });
  }, [appView, activeDropIndex, repoClass, repoQuery, editMode]);

  const setCellRef = (row: number, col: number, element: HTMLElement | null) => {
    cellRefs.current[`${row}-${col}`] = element;
  };

  const focusCell = (row: number, col: number) => {
    if (row < 0 || row >= activeDrop.slots.length || col < 0 || col >= GRID_COLUMNS) return;
    cellRefs.current[`${row}-${col}`]?.focus();
  };

  const onGridKeyDown = (event: React.KeyboardEvent, row: number, col: number) => {
    if (editMode !== "edit") return;
    if (event.key === "Enter") {
      event.preventDefault();
      focusCell(Math.min(row + 1, activeDrop.slots.length - 1), col);
    } else if (event.key === "Tab") {
      event.preventDefault();
      const nextCol = event.shiftKey ? col - 1 : col + 1;
      if (nextCol < 0) focusCell(Math.max(0, row - 1), GRID_COLUMNS - 1);
      else if (nextCol >= GRID_COLUMNS) focusCell(Math.min(activeDrop.slots.length - 1, row + 1), 0);
      else focusCell(row, nextCol);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusCell(row, Math.min(GRID_COLUMNS - 1, col + 1));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusCell(row, Math.max(0, col - 1));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCell(Math.min(activeDrop.slots.length - 1, row + 1), col);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCell(Math.max(0, row - 1), col);
    }
  };

  const updateSlot = (rowIndex: number, updater: (slot: DeckRow) => DeckRow) => {
    setDrops((previous) =>
      previous.map((drop, dropIndex) => {
        if (dropIndex !== activeDropIndex) return drop;
        return { ...drop, slots: drop.slots.map((slot, idx) => (idx === rowIndex ? updater({ ...slot }) : slot)) };
      }),
    );
  };

  const setField = (rowIndex: number, field: keyof DeckRow, value: string) => updateSlot(rowIndex, (slot) => ({ ...slot, [field]: value }));
  const setWeightClass = (rowIndex: number, value: WeightClass) => updateSlot(rowIndex, (slot) => ({ ...slot, weightClass: value }));

  const setMechVariant = (rowIndex: number, variantCode: string) => {
    updateSlot(rowIndex, (slot) => {
      const normalizedCode = normalizeVariantCode(variantCode);
      const variant = findVariantByCode(variantCode) || findVariantByCode(normalizedCode);
      const parsed = fromVariantCode(normalizedCode);
      if (!variant) return { ...slot, mech: parsed.mech, variant: parsed.variant };
      const firstBuild = variant.builds[0];
      return {
        ...slot,
        mech: parsed.mech,
        variant: parsed.variant,
        weightClass: variant.weightClass,
        role: firstBuild?.role ?? slot.role,
        skillCode: firstBuild?.skillCode ?? slot.skillCode,
        keyFactors: firstBuild?.description ?? slot.keyFactors,
      };
    });
  };

  const setBuild = (rowIndex: number, buildName: string) => {
    updateSlot(rowIndex, (slot) => {
      const variant = resolveVariant(slot);
      const build = variant?.builds.find((entry) => entry.name === buildName);
      if (!build) return slot;
      return { ...slot, role: build.role, skillCode: build.skillCode ?? slot.skillCode, keyFactors: build.description ?? slot.keyFactors };
    });
  };

  const mapPanel = (
    <Paper
      elevation={0}
      sx={{
        minHeight: 260,
        borderRadius: 1.5,
        overflow: "hidden",
        border: "1px solid rgba(130, 154, 217, 0.35)",
        background:
          "radial-gradient(circle at 30% 30%, rgba(112, 142, 218, 0.35), rgba(10, 16, 32, 0.98) 65%)",
        position: "relative",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          opacity: 0.22,
        }}
      />
      <Box sx={{ position: "relative", p: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2 }}>
          <Box>
            <Typography sx={{ color: "#eef4ff", fontWeight: 800, letterSpacing: 0.6 }}>
              {activeDrop.map}
            </Typography>
            <Typography variant="body2" sx={{ color: "#aebde8", mt: 0.4 }}>
              {activeDrop.gameMode} battlefield overview
            </Typography>
          </Box>
          <Chip label={`Drop ${activeDrop.dropNumber}`} size="small" sx={{ bgcolor: "rgba(255,255,255,0.08)", color: "#f4f7ff" }} />
        </Box>

        <Box
          sx={{
            mt: 2,
            minHeight: 176,
            borderRadius: 1.25,
            border: "1px solid rgba(190, 205, 255, 0.2)",
            background:
              "linear-gradient(180deg, rgba(16, 23, 45, 0.88), rgba(8, 13, 27, 0.96))",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 16,
              borderRadius: 1,
              border: "1px solid rgba(142, 164, 255, 0.18)",
              background:
                "linear-gradient(135deg, rgba(58, 70, 101, 0.12) 25%, transparent 25%), linear-gradient(225deg, rgba(58, 70, 101, 0.12) 25%, transparent 25%), linear-gradient(45deg, rgba(58, 70, 101, 0.12) 25%, transparent 25%), linear-gradient(315deg, rgba(58, 70, 101, 0.12) 25%, transparent 25%)",
              backgroundPosition: "18px 0, 18px 0, 0 0, 0 0",
              backgroundSize: "18px 18px",
            }}
          />
          <Box sx={{ position: "relative", height: "100%", p: 2, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <Box>
              <Typography sx={{ color: "#f7faff", fontWeight: 700 }}>{activeDrop.name}</Typography>
              <Typography variant="body2" sx={{ color: "#b7c6ee", mt: 0.25 }}>
                Focus lanes, staging, flank pressure, and anchor positions.
              </Typography>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1 }}>
              {["Left flank", "Center push", "Right flank"].map((lane) => (
                <Paper
                  key={lane}
                  elevation={0}
                  sx={{
                    p: 1,
                    borderRadius: 1,
                    background: "rgba(11, 18, 38, 0.82)",
                    border: "1px solid rgba(141, 162, 234, 0.18)",
                  }}
                >
                  <Typography variant="caption" sx={{ color: "#91a4d4", display: "block" }}>
                    {lane}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#eff4ff", fontWeight: 600 }}>
                    Route / anchor space
                  </Typography>
                </Paper>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </Paper>
  );

  const strategyPanel = (
    <Paper
      elevation={0}
      sx={{
        minHeight: 260,
        borderRadius: 1.5,
        border: "1px solid rgba(130, 154, 217, 0.35)",
        background: "rgba(11, 16, 33, 0.92)",
      }}
    >
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2 }}>
          <Box>
            <Typography sx={{ color: "#eef4ff", fontWeight: 800 }}>Strategy</Typography>
            <Typography variant="body2" sx={{ color: "#afbfeb", mt: 0.35 }}>
              Describe intent, timing, and team responsibilities for this drop.
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Chip label={`Pilots: ${activeDrop.slots.length}`} size="small" />
            <Chip label={`Map: ${activeDrop.map}`} size="small" />
          </Box>
        </Box>

        <Box sx={{ mt: 2, display: "grid", gap: 1.5 }}>
          <TextField
            label="Strategy"
            value={activeDrop.slots[0]?.strategy ?? ""}
            disabled={editMode !== "edit"}
            multiline
            minRows={4}
            fullWidth
            onChange={(event) => setField(0, "strategy", event.target.value)}
          />
          <TextField
            label="Key factors"
            value={activeDrop.slots[0]?.strategyFactors ?? ""}
            disabled={editMode !== "edit"}
            multiline
            minRows={4}
            fullWidth
            onChange={(event) => setField(0, "strategyFactors", event.target.value)}
          />
        </Box>
      </Box>
    </Paper>
  );

  return (
    <Box sx={{ minHeight: "100vh", backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(180deg, #111731 0%, #0b1020 100%)", backgroundSize: "28px 28px, 28px 28px, 100% 100%", pb: 4 }}>
      <AppBar position="sticky" elevation={0} sx={{ backdropFilter: "blur(8px)", background: "rgba(12, 16, 30, 0.86)", borderBottom: "1px solid rgba(136, 159, 220, 0.3)" }}>
        <Toolbar sx={{ justifyContent: "flex-start", gap: 2, flexWrap: "wrap" }}>
          <Stack spacing={0.25} sx={{ mr: 2 }}>
            <Typography sx={{ fontWeight: 700, color: "#f0f4ff" }}>{CS2026_ROUND1.season}</Typography>
            <Typography variant="caption" sx={{ color: "#afbbdf" }}>Round {CS2026_ROUND1.round} | Deck Workbench</Typography>
          </Stack>
          <Tabs value={appView} onChange={(_, value: AppView) => setAppView(value)} textColor="inherit" indicatorColor="secondary" sx={{ "& .MuiTab-root": { color: "#d2dcff" }, "& .Mui-selected": { color: "#ffffff" } }}>
            <Tab label="Deck Builder" />
            <Tab label="Mech Repository" />
          </Tabs>
          <ButtonGroup size="small" sx={{ ml: { xs: 0, md: "auto" } }}>
            <Button variant={editMode === "view" ? "contained" : "outlined"} onClick={() => setEditMode("view")}>View</Button>
            <Button variant={editMode === "edit" ? "contained" : "outlined"} onClick={() => setEditMode("edit")}>Edit</Button>
          </ButtonGroup>
        </Toolbar>
      </AppBar>

      <Container maxWidth={false} sx={{ px: { xs: 1, md: 2 }, pt: 2 }}>
        {appView === 0 && (
          <Stack spacing={2}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1.1fr 0.9fr" }, gap: 2 }}>
              {mapPanel}
              {strategyPanel}
            </Box>

            <Paper elevation={0} sx={{ borderRadius: 1.5, border: "1px solid rgba(130, 154, 217, 0.35)", background: "rgba(11, 16, 33, 0.92)", overflow: "hidden" }}>
              <Tabs value={activeDropIndex} onChange={(_, value: number) => setActiveDropIndex(value)} variant="scrollable" scrollButtons="auto" sx={{ borderBottom: "1px solid rgba(130, 154, 217, 0.28)", "& .MuiTab-root": { color: "#bfcaf0", minHeight: 38 }, "& .Mui-selected": { color: "#ffffff" } }}>
                {drops.map((drop) => (<Tab key={drop.dropNumber} label={`Drop ${drop.dropNumber}: ${drop.name}`} />))}
              </Tabs>

              <Box sx={{ px: 2, py: 1.2, borderBottom: "1px solid rgba(130, 154, 217, 0.2)" }}>
                <Typography sx={{ color: "#e8eeff", fontWeight: 700 }}>{activeDrop.name}</Typography>
                <Typography variant="body2" sx={{ color: "#b2bfeb" }}>{activeDrop.gameMode} | {activeDrop.map} | 8 slots</Typography>
              </Box>

              <TableContainer sx={{ maxWidth: "100%", overflowX: "hidden" }}>
                <Table size="small" sx={{ tableLayout: "fixed", width: "100%" }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: "#dbe4ff", fontWeight: 700, width: 130 }}>Pilots</TableCell>
                    <TableCell sx={{ color: "#dbe4ff", fontWeight: 700, width: 130 }}>Alternates</TableCell>
                    <TableCell sx={{ color: "#dbe4ff", fontWeight: 700, width: 88 }}>Class</TableCell>
                    <TableCell sx={{ color: "#dbe4ff", fontWeight: 700, width: 68 }}>Lance</TableCell>
                    <TableCell sx={{ color: "#dbe4ff", fontWeight: 700, width: 100 }}>Map</TableCell>
                    <TableCell sx={{ color: "#dbe4ff", fontWeight: 700, width: 152 }}>Mech Variant</TableCell>
                    <TableCell sx={{ color: "#dbe4ff", fontWeight: 700, width: 112 }}>Build</TableCell>
                    <TableCell sx={{ color: "#dbe4ff", fontWeight: 700, width: 112 }}>Role</TableCell>
                    <TableCell sx={{ color: "#dbe4ff", fontWeight: 700, width: 150 }}>Strategy</TableCell>
                    <TableCell sx={{ color: "#dbe4ff", fontWeight: 700, width: 170 }}>Factors</TableCell>
                    <TableCell sx={{ color: "#dbe4ff", fontWeight: 700, width: 190 }}>Notes</TableCell>
                    <TableCell sx={{ color: "#dbe4ff", fontWeight: 700, width: 90 }}>Skill</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activeDrop.slots.map((slot, rowIndex) => {
                    const variant = resolveVariant(slot);
                    const buildOptions: MechBuild[] = variant?.builds ?? [];
                    const selectedBuild = buildOptions.find((build) => build.role === slot.role || (Boolean(slot.skillCode) && build.skillCode === slot.skillCode))?.name ?? "";
                    return (
                      <TableRow key={slot.slot} className="deck-row" hover sx={{ verticalAlign: "top" }}>
                        <TableCell sx={{ width: 130, px: 1, py: 1 }}>
                          <Autocomplete multiple freeSolo size="small" options={PILOT_OPTIONS} value={splitCsv(slot.pilot)} disabled={editMode !== "edit"} onChange={(_, values) => setField(rowIndex, "pilot", joinCsv(values))}
                            renderInput={(params) => (<TextField {...params} placeholder="Select pilots" onKeyDown={(event) => onGridKeyDown(event, rowIndex, 0)} inputRef={(element) => setCellRef(rowIndex, 0, element)} />)} />
                        </TableCell>
                        <TableCell sx={{ width: 130, px: 1, py: 1 }}>
                          <Autocomplete multiple freeSolo size="small" options={PILOT_OPTIONS} value={splitCsv(slot.candidateBackup)} disabled={editMode !== "edit"} onChange={(_, values) => setField(rowIndex, "candidateBackup", joinCsv(values))}
                            renderInput={(params) => (<TextField {...params} placeholder="Alternates" onKeyDown={(event) => onGridKeyDown(event, rowIndex, 1)} inputRef={(element) => setCellRef(rowIndex, 1, element)} />)} />
                        </TableCell>
                        <TableCell sx={{ width: 88, px: 0.5, py: 1 }}>
                          <FormControl size="small" fullWidth>
                            <InputLabel>Class</InputLabel>
                            <Select label="Class" value={slot.weightClass} disabled={editMode !== "edit"} onKeyDown={(event) => onGridKeyDown(event, rowIndex, 2)} onChange={(event) => setWeightClass(rowIndex, event.target.value as WeightClass)} inputRef={(element: HTMLElement | null) => setCellRef(rowIndex, 2, element)}>
                              {WEIGHT_CLASSES.map((weightClass) => (<MenuItem key={weightClass} value={weightClass}>{weightClass}</MenuItem>))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell sx={{ width: 68, px: 0.5, py: 1 }}>
                          <FormControl size="small" fullWidth>
                            <InputLabel>Lance</InputLabel>
                            <Select label="Lance" value={slot.lance} disabled={editMode !== "edit"} onKeyDown={(event) => onGridKeyDown(event, rowIndex, 3)} onChange={(event) => setField(rowIndex, "lance", event.target.value)} inputRef={(element: HTMLElement | null) => setCellRef(rowIndex, 3, element)}>
                              {LANCE_OPTIONS.map((lance) => (<MenuItem key={`lance-${lance || "none"}`} value={lance}>{lance || "-"}</MenuItem>))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell sx={{ width: 100, px: 0.5, py: 1 }}>
                          <TextField size="small" fullWidth value={slot.map} disabled={editMode !== "edit"} onChange={(event) => setField(rowIndex, "map", event.target.value)} onKeyDown={(event) => onGridKeyDown(event, rowIndex, 4)} inputRef={(element) => setCellRef(rowIndex, 4, element)} />
                        </TableCell>
                        <TableCell sx={{ width: 152, px: 0.5, py: 1 }}>
                          <FormControl size="small" fullWidth>
                            <InputLabel>Variant</InputLabel>
                            <Select label="Variant" value={toVariantCode(slot)} disabled={editMode !== "edit"} onKeyDown={(event) => onGridKeyDown(event, rowIndex, 5)} onChange={(event) => setMechVariant(rowIndex, event.target.value)} inputRef={(element: HTMLElement | null) => setCellRef(rowIndex, 5, element)}>
                              {ALL_VARIANTS.map((entry) => (<MenuItem key={entry.code} value={entry.code}>{entry.code} | {entry.displayName}</MenuItem>))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell sx={{ width: 112, px: 0.5, py: 1 }}>
                          <FormControl size="small" fullWidth>
                            <InputLabel>Build</InputLabel>
                            <Select label="Build" value={selectedBuild} disabled={editMode !== "edit"} onKeyDown={(event) => onGridKeyDown(event, rowIndex, 6)} onChange={(event) => setBuild(rowIndex, event.target.value)} inputRef={(element: HTMLElement | null) => setCellRef(rowIndex, 6, element)}>
                              <MenuItem value=""><em>Manual</em></MenuItem>
                              {buildOptions.map((build) => (<MenuItem key={build.name} value={build.name}>{build.name}</MenuItem>))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell sx={{ width: 112, px: 0.5, py: 1 }}><TextField size="small" fullWidth value={slot.role} disabled={editMode !== "edit"} onChange={(event) => setField(rowIndex, "role", event.target.value)} onKeyDown={(event) => onGridKeyDown(event, rowIndex, 7)} inputRef={(element) => setCellRef(rowIndex, 7, element)} /></TableCell>
                        <TableCell sx={{ width: 150, px: 0.5, py: 1 }}><TextField size="small" fullWidth value={slot.strategy} disabled={editMode !== "edit"} onChange={(event) => setField(rowIndex, "strategy", event.target.value)} onKeyDown={(event) => onGridKeyDown(event, rowIndex, 8)} inputRef={(element) => setCellRef(rowIndex, 8, element)} /></TableCell>
                        <TableCell sx={{ width: 170, px: 0.5, py: 1 }}><TextField size="small" fullWidth multiline minRows={2} value={slot.strategyFactors} disabled={editMode !== "edit"} onChange={(event) => setField(rowIndex, "strategyFactors", event.target.value)} onKeyDown={(event) => onGridKeyDown(event, rowIndex, 9)} inputRef={(element) => setCellRef(rowIndex, 9, element)} /></TableCell>
                        <TableCell sx={{ width: 190, px: 0.5, py: 1 }}><TextField size="small" fullWidth multiline minRows={2} value={slot.notes} disabled={editMode !== "edit"} onChange={(event) => setField(rowIndex, "notes", event.target.value)} onKeyDown={(event) => onGridKeyDown(event, rowIndex, 10)} inputRef={(element) => setCellRef(rowIndex, 10, element)} /></TableCell>
                        <TableCell sx={{ width: 90, px: 0.5, py: 1 }}><TextField size="small" fullWidth value={slot.skillCode ?? ""} disabled={editMode !== "edit"} onChange={(event) => setField(rowIndex, "skillCode", event.target.value)} onKeyDown={(event) => onGridKeyDown(event, rowIndex, 11)} inputRef={(element) => setCellRef(rowIndex, 11, element)} /></TableCell>
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
          <Stack spacing={2}>
            <Paper elevation={0} sx={{ p: 2, borderRadius: 1.5, border: "1px solid rgba(130, 154, 217, 0.35)", background: "rgba(14, 20, 40, 0.9)" }}>
              <Typography sx={{ color: "#f0f5ff", fontWeight: 700 }}>Mech Repository</Typography>
              <Typography variant="body2" sx={{ color: "#b7c5ef", mt: 0.5 }}>Variants are sourced from local repository data. Parenthesis variants are normalized as aliases of their non-parenthesis equivalent.</Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mt: 1.2 }}>
                <Tabs value={repoClass} onChange={(_, value: ClassTab) => setRepoClass(value)} variant="scrollable" scrollButtons="auto" sx={{ "& .MuiTab-root": { color: "#c7d2f3" }, "& .Mui-selected": { color: "#ffffff" } }}>
                  {CLASS_TABS.map((weight) => (<Tab key={weight} label={weight} value={weight} />))}
                </Tabs>
                <TextField size="small" label="Search variants / roles" value={repoQuery} onChange={(event) => setRepoQuery(event.target.value)} sx={{ minWidth: { xs: "100%", md: 300 } }} />
              </Stack>
            </Paper>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 2 }}>
              <Paper elevation={0} sx={{ p: 2, borderRadius: 1.5, border: "1px solid rgba(130, 154, 217, 0.35)", background: "rgba(10, 16, 32, 0.9)" }}>
                <Typography sx={{ color: "#eef4ff", fontWeight: 700, mb: 1.2 }}>Repository Variants ({filteredVariants.length})</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0,1fr))" }, gap: 1.2 }}>
                  {filteredVariants.map((variant) => (
                    <Card key={variant.code} className="repo-card" elevation={0} sx={{ borderRadius: 1.2, border: "1px solid rgba(121, 146, 210, 0.35)", background: "rgba(18, 27, 52, 0.92)" }}>
                      <CardContent sx={{ pb: "12px !important" }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.6 }}>
                          <Typography sx={{ color: "#f5f8ff", fontWeight: 700 }}>{variant.code}</Typography>
                          <Chip size="small" label={variant.weightClass} />
                        </Box>
                        <Typography sx={{ color: "#cbd8ff" }}>{variant.displayName}</Typography>
                        <Typography variant="body2" sx={{ color: "#9fb2ea", mb: 0.8 }}>{variant.chassisId} | {variant.chassisName}</Typography>
                        {variant.builds.map((build) => (<Typography key={build.name} variant="body2" sx={{ color: "#c2d0f9" }}>{build.name} | {build.role} | {build.skillCode ?? "-"}</Typography>))}
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              </Paper>
              <Paper elevation={0} sx={{ p: 2, borderRadius: 1.5, border: "1px solid rgba(130, 154, 217, 0.35)", background: "rgba(10, 16, 32, 0.9)" }}>
                <Typography sx={{ color: "#eef4ff", fontWeight: 700, mb: 1.2 }}>Nav-Alpha Chassis Index ({repoClass})</Typography>
                <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
                  {NAV_ALPHA_CHASSIS_BY_CLASS[repoClass].map((name) => (<Chip key={name} label={name} variant="outlined" size="small" />))}
                </Stack>
              </Paper>
            </Box>
          </Stack>
        )}
      </Container>
    </Box>
  );
}
