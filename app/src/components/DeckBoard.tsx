import { useEffect, useMemo, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AppBar,
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
import { getDropDecks, getMapConfigs, getMechHierarchy, getMechs, saveDropDeck } from "../api/client";
import { CS2026_ROUND1 } from "../data/decks";
import { useMatchNightApi } from "../hooks/useMatchNightApi";
import type {
  ChassisSummary,
  DeckMap,
  DropDeckEditable,
  DeckSide,
  DropDeckDoc,
  DropDeckUpsertInput,
  MapConfigDoc,
  MechDoc,
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
};

type DeckTemplate = {
  id: string;
  name: string;
  map: DeckMap;
  side: TeamSide;
  description: string;
  revision?: number;
  updatedAt?: string;
  rows: DeckRow[];
};

type MechOption = {
  id: string;
  label: string;
};

type DeckBoardProps = {
  mode: "light" | "dark";
  onToggleMode: () => void;
};

const MAP_FALLBACK_OPTIONS: DeckMap[] = ["Alpine Peaks", "Bear Claw II", "Crimson Strait", "Frozen City", "River City"];
const SIDE_OPTIONS: TeamSide[] = ["1", "2", "either"];
const ROW_COUNT = 8;
const LANCE_OPTIONS: Lance[] = ["", "A", "B", "C"];
const DECK_AUTOSAVE_DELAY_MS = 1000;
const DECK_POLL_INTERVAL_MS = 5000;

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

function createEmptyRow(slot: number): DeckRow {
  return {
    slot,
    primary: [],
    alternates: [],
    lance: "",
    mech: "",
  };
}

function createTemplate(map: DeckMap, side: TeamSide, version = 1): DeckTemplate {
  return {
    id: `${map}-${side}-${version}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `${map} ${side} v${version}`,
    map,
    side,
    description: "",
    rows: Array.from({ length: ROW_COUNT }, (_, idx) => createEmptyRow(idx + 1)),
  };
}

function defaultTemplates(mapOptions: DeckMap[]): DeckTemplate[] {
  return mapOptions.flatMap((map) => SIDE_OPTIONS.map((side) => createTemplate(map, side, 1)));
}

function normalizeRow(slot: number, row?: Partial<DeckRow>): DeckRow {
  return {
    slot,
    primary: row?.primary ?? [],
    alternates: row?.alternates ?? [],
    lance: row?.lance ?? "",
    mech: row?.mech ?? "",
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
    description: doc.description ?? doc.strategy ?? "",
    revision: doc.revision,
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function templateSignature(template: DeckTemplate): string {
  return JSON.stringify({
    map: template.map,
    side: template.side,
    name: template.name,
    description: template.description,
    rows: template.rows,
  });
}

function toDropDeckEditable(template: DeckTemplate): DropDeckEditable {
  return {
    map: template.map,
    side: template.side,
    description: template.description,
    name: template.name,
    deck: template.rows.map((row) => ({
      slot: row.slot,
      primary: row.primary,
      alternates: row.alternates,
      lance: row.lance,
      mech: row.mech,
    })),
  };
}

function toDropDeckUpsertInput(template: DeckTemplate, baseTemplate?: DeckTemplate): DropDeckUpsertInput {
  return {
    id: isUuid(template.id) ? template.id : undefined,
    baseRevision: baseTemplate?.revision,
    baseDeck: baseTemplate ? toDropDeckEditable(baseTemplate) : undefined,
    ...toDropDeckEditable(template),
  };
}

export function DeckBoard({ mode, onToggleMode }: DeckBoardProps) {
  const isLight = mode === "light";
  const syncedSignaturesRef = useRef<Map<string, string>>(new Map());
  const syncedTemplatesRef = useRef<Map<string, DeckTemplate>>(new Map());

  const [appView, setAppView] = useState<AppView>(0);
  const [editMode, setEditMode] = useState<EditMode>("edit");
  const [mapConfigs, setMapConfigs] = useState<MapConfigDoc[]>([]);
  const [selectedMap, setSelectedMap] = useState<DeckMap>(MAP_FALLBACK_OPTIONS[0]);
  const [templates, setTemplates] = useState<DeckTemplate[]>(defaultTemplates(MAP_FALLBACK_OPTIONS));
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckSaving, setDeckSaving] = useState(false);
  const [deckError, setDeckError] = useState("");
  const [mechs, setMechs] = useState<MechDoc[]>([]);
  const [mechLoading, setMechLoading] = useState(false);
  const [mechError, setMechError] = useState<string>("");
  const [repoHierarchy, setRepoHierarchy] = useState<WeightClassSummary[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState<string>("");
  const { error } = useMatchNightApi();

  const mapOptions = useMemo<DeckMap[]>(() => {
    if (!mapConfigs.length) return MAP_FALLBACK_OPTIONS;
    return mapConfigs.map((entry) => entry.name);
  }, [mapConfigs]);

  const selectedMapConfig = useMemo(() => mapConfigs.find((entry) => entry.name === selectedMap), [mapConfigs, selectedMap]);

  useEffect(() => {
    let cancelled = false;
    getMapConfigs()
      .then((configs) => {
        if (cancelled) return;
        if (!configs.length) return;
        setMapConfigs(configs);
        setSelectedMap((previous) => (configs.some((entry) => entry.name === previous) ? previous : configs[0].name));
      })
      .catch(() => {
        // Keep fallback map tabs when config docs are unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
          syncedSignaturesRef.current = new Map();
          syncedTemplatesRef.current = new Map();
          setTemplates(defaultTemplates(mapOptions));
          setSelectedTemplateId("");
          return;
        }

        const mapped = docs.map((doc) => toTemplate(doc));
        syncedSignaturesRef.current = new Map(mapped.map((template) => [template.id, templateSignature(template)]));
        syncedTemplatesRef.current = new Map(mapped.map((template) => [template.id, template]));
        setTemplates(mapped);
        setSelectedMap(mapped[0].map);
        setSelectedTemplateId(mapped[0].id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load drop decks";
        const looksLikeNetworkError = /NetworkError|Failed to fetch|Load failed/i.test(message);
        setDeckError(looksLikeNetworkError ? "" : message);
        setTemplates(defaultTemplates(mapOptions));
      })
      .finally(() => {
        if (!cancelled) setDeckLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appView, mapOptions]);

  const mechOptions: MechOption[] = useMemo(() => {
    return [...mechs]
      .map((mech) => ({
        id: mech.id,
        label: `${mech.chassis} ${mech.variant}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [mechs]);

  const mechLookup = useMemo(() => new Map(mechs.map((mech) => [mech.id, mech])), [mechs]);

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
    () => templates.filter((template) => template.map === selectedMap),
    [templates, selectedMap],
  );

  useEffect(() => {
    if (!templatesForSelection.length) return;
    const exists = templatesForSelection.some((template) => template.id === selectedTemplateId);
    if (!exists) setSelectedTemplateId(templatesForSelection[0].id);
  }, [templatesForSelection, selectedTemplateId]);

  const activeTemplate =
    templatesForSelection.find((template) => template.id === selectedTemplateId) ?? templatesForSelection[0];

  const activeTemplateId = activeTemplate?.id ?? "";
  const activeTemplateSignature = useMemo(
    () => (activeTemplate ? templateSignature(activeTemplate) : ""),
    [activeTemplate],
  );

  const totalTonnage = useMemo(() => {
    if (!activeTemplate) return 0;
    return activeTemplate.rows.reduce((sum, row) => sum + (mechLookup.get(row.mech)?.tonnage ?? 0), 0);
  }, [activeTemplate, mechLookup]);

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
    updateRow(rowIndex, (row) => {
      return {
        ...row,
        mech: mechCode,
      };
    });
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
    const version = templates.filter((template) => template.map === selectedMap).length + 1;
    const copy: DeckTemplate = {
      ...activeTemplate,
      id: `${activeTemplate.id}-copy-${Date.now()}`,
      name: `${selectedMap} ${sideLabel(activeTemplate.side)} v${version}`,
      rows: activeTemplate.rows.map((row) => ({ ...row, primary: [...row.primary], alternates: [...row.alternates] })),
    };
    setTemplates((previous) => [...previous, copy]);
    setSelectedTemplateId(copy.id);
  };

  const createFreshTemplate = () => {
    const version = templates.filter((template) => template.map === selectedMap).length + 1;
    const fresh = createTemplate(selectedMap, activeTemplate?.side ?? "either", version);
    setTemplates((previous) => [...previous, fresh]);
    setSelectedTemplateId(fresh.id);
  };

  const onMapChange = (map: DeckMap) => {
    setSelectedMap(map);
    const candidate = templates.find((template) => template.map === map);
    if (candidate) setSelectedTemplateId(candidate.id);
  };

  useEffect(() => {
    if (appView !== 0 || !activeTemplate) return;

    const syncedSignature = syncedSignaturesRef.current.get(activeTemplate.id);
    if (syncedSignature === activeTemplateSignature) return;

    const baseTemplate = syncedTemplatesRef.current.get(activeTemplate.id);

    const timeoutId = window.setTimeout(async () => {
      setDeckSaving(true);
      try {
        const savedDoc = await saveDropDeck(toDropDeckUpsertInput(activeTemplate, baseTemplate));
        const savedTemplate = toTemplate(savedDoc);
        syncedSignaturesRef.current.set(savedTemplate.id, templateSignature(savedTemplate));
        syncedTemplatesRef.current.set(savedTemplate.id, savedTemplate);
        if (savedTemplate.id !== activeTemplate.id) {
          syncedSignaturesRef.current.delete(activeTemplate.id);
          syncedTemplatesRef.current.delete(activeTemplate.id);
        }

        setTemplates((previous) =>
          previous.map((template) => (template.id === activeTemplate.id ? savedTemplate : template)),
        );
        if (savedTemplate.id !== activeTemplate.id) {
          setSelectedTemplateId(savedTemplate.id);
        }
        setDeckError("");
      } catch (err: unknown) {
        const error = err as Error & { code?: string; details?: unknown };
        if (error.code === "WRITE_CONFLICT") {
          const latest = (error.details as { latest?: DropDeckDoc } | undefined)?.latest;
          if (latest) {
            const latestTemplate = toTemplate(latest);
            syncedSignaturesRef.current.set(latestTemplate.id, templateSignature(latestTemplate));
            syncedTemplatesRef.current.set(latestTemplate.id, latestTemplate);
            setTemplates((previous) =>
              previous.map((template) => (template.id === activeTemplate.id ? latestTemplate : template)),
            );
            if (latestTemplate.id !== activeTemplate.id) {
              setSelectedTemplateId(latestTemplate.id);
            }
          }
          setDeckError("This deck was changed by another user. Latest changes were loaded.");
        } else {
          setDeckError(err instanceof Error ? err.message : "Failed to save drop deck");
        }
      } finally {
        setDeckSaving(false);
      }
    }, DECK_AUTOSAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeTemplate, activeTemplateSignature, appView]);

  useEffect(() => {
    if (appView !== 0) return;

    const intervalId = window.setInterval(async () => {
      const dirtyActiveTemplate = activeTemplate
        ? syncedSignaturesRef.current.get(activeTemplate.id) !== templateSignature(activeTemplate)
        : false;

      if (dirtyActiveTemplate || deckSaving) {
        return;
      }

      try {
        const docs = await getDropDecks();
        if (!docs.length) {
          return;
        }

        const mapped = docs.map((doc) => toTemplate(doc));
        syncedSignaturesRef.current = new Map(mapped.map((template) => [template.id, templateSignature(template)]));
        syncedTemplatesRef.current = new Map(mapped.map((template) => [template.id, template]));
        setTemplates(mapped);
        setSelectedTemplateId((previous) => (mapped.some((template) => template.id === previous) ? previous : mapped[0]?.id ?? ""));
      } catch {
        // Keep stale data on screen until the next successful poll.
      }
    }, DECK_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeTemplate, appView, deckSaving]);

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
                {mapOptions.map((map) => (
                  <Tab key={map} label={map} value={map} />
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
                      {template.name} ({sideLabel(template.side)})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel>Side</InputLabel>
                <Select
                  label="Side"
                  value={activeTemplate?.side ?? "either"}
                  onChange={(event) =>
                    updateActiveTemplate((template) => ({
                      ...template,
                      side: event.target.value as TeamSide,
                    }))
                  }
                >
                  {SIDE_OPTIONS.map((side) => (
                    <MenuItem key={side} value={side}>
                      {sideLabel(side)}
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
            <Typography sx={{ color: isLight ? "#2f3f59" : "#edf4ff", fontWeight: 700, mb: 1.2 }}>Description</Typography>
            <TextField
              variant="standard"
              fullWidth
              multiline
              minRows={11}
              value={activeTemplate?.description ?? ""}
              disabled={editMode !== "edit"}
              onChange={(event) =>
                updateActiveTemplate((template) => ({
                  ...template,
                  description: event.target.value,
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
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                backgroundBlendMode: "overlay",
                backgroundImage:
                  `${isLight
                    ? "linear-gradient(rgba(99,119,148,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(99,119,148,0.16) 1px, transparent 1px)"
                    : "linear-gradient(rgba(207,221,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(207,221,255,0.08) 1px, transparent 1px)"}${selectedMapConfig?.imageUrl ? `, url(${selectedMapConfig.imageUrl})` : ""}`,
                backgroundSize: selectedMapConfig?.imageUrl ? "30px 30px, 30px 30px, cover" : "30px 30px, 30px 30px",
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
                Deck Table ({selectedMap})
              </Typography>
              <Typography variant="body2" sx={{ color: isLight ? "#556887" : "#bfd0ff" }}>
                {activeTemplate?.name || "Unnamed dropdeck"}
                {activeTemplate?.side ? ` | Side ${sideLabel(activeTemplate.side)}` : ""}
                {formatUpdatedAt(activeTemplate?.updatedAt) ? ` | Updated ${formatUpdatedAt(activeTemplate?.updatedAt)}` : ""}
                {deckSaving ? " | Syncing..." : ""}
              </Typography>
            </Stack>
            <Typography sx={{ color: isLight ? "#556887" : "#bfd0ff", fontWeight: 700 }}>Total Tonnage: {totalTonnage} t</Typography>
          </Box>

          <TableContainer sx={{ overflowX: "auto" }}>
            <Table
              size="medium"
              sx={{
                minWidth: 980,
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
                  <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 280 }}>Mech Data</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeTemplate?.rows.map((row, rowIndex) => {
                  const mech = mechLookup.get(row.mech);

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
                              <MenuItem key={entry.id} value={entry.id}>
                                {entry.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ color: isLight ? "#4f6282" : "#d3ddfc" }}>
                          {mech ? `${mech.tonnage}T | ${mech.class} | ${mech.role}` : "-"}
                        </Typography>
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
