import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppBar,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
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
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Typography,
  Tooltip,
} from "@mui/material";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import { getDropDecks, getMapConfigs, getMechHierarchy, getMechs, saveDropDeck } from "../api/client";
import { CS2026_ROUND1 } from "../data/decks";
import { useMatchNightApi } from "../hooks/useMatchNightApi";
import { MechSelector } from "./MechSelector";
import { AddBuildDialog } from "./AddBuildDialog";
import { RepositoryView } from "./RepositoryView";
import type {
  DeckMap,
  DropDeckEditable,
  DeckSide,
  DropDeckDoc,
  DropDeckUpsertInput,
  ConfigMech,
  MapConfigDoc,
  MechDoc,
  MechsConfigFile,
  SelectorSource,
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
  chassis: string;
  variant: string;
  weaponry: string;
  equipmentText: string;
  codename: string;
  buildUrl: string;
  role?: string;
  loadout?: string;
  buildCode?: string;
  skillTree?: string;
  weightClass?: string;
  tonnage?: number | "";
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

const getPilotShortcode = (pilotName: string): string => {
  return pilotName.substring(0, 4).toUpperCase();
};

const formatPilotDisplay = (pilots: string[]): string => {
  if (!pilots.length) return "";
  return pilots.map(getPilotShortcode).join(", ");
};

const editSelectIconSx = {
  "& .MuiSelect-icon": { opacity: 0, transition: "opacity 140ms ease" },
  "&:hover .MuiSelect-icon": { opacity: 0.5 },
  "&.Mui-focused .MuiSelect-icon": { opacity: 0.5 },
};

function createEmptyRow(slot: number): DeckRow {
  return {
    slot,
    primary: [],
    alternates: [],
    lance: "",
    mech: "",
    chassis: "",
    variant: "",
    weaponry: "",
    equipmentText: "",
    codename: "",
    buildUrl: "",
    role: "",
    skillTree: "",
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
    chassis: row?.chassis ?? "",
    variant: row?.variant ?? "",
    weaponry: row?.weaponry ?? "",
    equipmentText: row?.equipmentText ?? "",
    codename: row?.codename ?? "",
    buildUrl: row?.buildUrl ?? "",
    role: row?.role ?? "",
    skillTree: row?.skillTree ?? "",
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
  if (side === "1") return "Team 1";
  if (side === "2") return "Team 2";
  return "Either";
}

function resolveMechDetails(
  selection: string,
  mechs: MechDoc[],
  configuredByKey: Map<string, ConfigMech>,
): { mech?: MechDoc; configMech?: ConfigMech; label: string } {
  if (!selection) return { label: "-" };

  const byId = mechs.find((mech) => mech.id === selection);
  if (byId) return { mech: byId, label: `${byId.chassis}-${byId.variant}` };

  const config = configuredByKey.get(selection);
  if (config) return { configMech: config, label: `${config.chassis}-${config.variant}` };

  const byVariant = mechs.find((mech) => `${mech.chassis}-${mech.variant}` === selection);
  if (byVariant) return { mech: byVariant, label: selection };

  const byChassis = mechs.find((mech) => mech.chassis === selection);
  if (byChassis) return { mech: byChassis, label: selection };

  return { label: selection };
}

function toWeightClassLabel(value: string): "Light" | "Medium" | "Heavy" | "Assault" {
  if (value === "LIGHT") return "Light";
  if (value === "MEDIUM") return "Medium";
  if (value === "HEAVY") return "Heavy";
  return "Assault";
}

function flattenMechsConfig(file: MechsConfigFile): ConfigMech[] {
  const list: ConfigMech[] = [];
  for (const tech of Object.keys(file.mechs) as Array<"IS" | "Clan">) {
    const byClass = file.mechs[tech];
    for (const classKey of Object.keys(byClass) as Array<"LIGHT" | "MEDIUM" | "HEAVY" | "ASSAULT">) {
      const chassisRecords = byClass[classKey];
      for (const chassisName of Object.keys(chassisRecords)) {
        const chassis = chassisRecords[chassisName];
        for (const variant of chassis.variants) {
          list.push({
            key: `${chassis.chassis_name}|${variant}`,
            tech,
            class: toWeightClassLabel(classKey),
            chassis: chassis.chassis_name,
            variant,
            tonnage: chassis.tonnage,
          });
        }
      }
    }
  }

  return list;
}

async function loadMechsConfig(): Promise<ConfigMech[]> {
  const candidates = ["/mwo_docs/mechs_config.json", "/mechs_config.json"];
  for (const path of candidates) {
    try {
      const response = await fetch(path);
      if (!response.ok) continue;
      const parsed = (await response.json()) as MechsConfigFile;
      if (!parsed?.mechs) continue;
      return flattenMechsConfig(parsed);
    } catch {
      // Try next location.
    }
  }

  return [];
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
      chassis: row.chassis,
      variant: row.variant,
      weaponry: row.weaponry,
      equipmentText: row.equipmentText,
      codename: row.codename,
      buildUrl: row.buildUrl,
      role: row.role ?? "",
      skillTree: row.skillTree ?? "",
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
  const descriptionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descriptionDraftRef = useRef("");
  const [mechs, setMechs] = useState<MechDoc[]>([]);
  const [configuredMechs, setConfiguredMechs] = useState<ConfigMech[]>([]);
  const [mechSelectorSource, setMechSelectorSource] = useState<SelectorSource>("repository");
  const [repoHierarchy, setRepoHierarchy] = useState<WeightClassSummary[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState<string>("");
  const [addBuildDialogOpen, setAddBuildDialogOpen] = useState(false);
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

    Promise.all([getMechs(), loadMechsConfig()])
      .then(([cosmosMechs, configMechs]) => {
        if (cancelled) return;
        setMechs(cosmosMechs);
        setConfiguredMechs(configMechs);
      })
      .catch(async () => {
        try {
          const cosmosMechs = await getMechs();
          if (!cancelled) setMechs(cosmosMechs);
        } catch {
          // Silently fail, mechs are used for the deck selector.
        }
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

  const mechLookup = useMemo(() => new Map(mechs.map((mech) => [mech.id, mech])), [mechs]);
  const configuredByKey = useMemo(() => new Map(configuredMechs.map((mech) => [mech.key, mech])), [configuredMechs]);
  // Config catalog indexed by normalized chassis|variant for enrichment lookups.
  const configuredByPair = useMemo(
    () => new Map(configuredMechs.map((mech) => [`${mech.chassis}|${mech.variant}`.toLowerCase(), mech])),
    [configuredMechs],
  );
  // Repository mechs = all Cosmos docs shaped as ConfigMech (key = doc UUID).
  // Tech and tonnage are enriched from the config catalog when the Cosmos doc omits them.
  const repositoryMechs = useMemo<ConfigMech[]>(
    () =>
      mechs.map((doc) => {
        // Infer tech from chassis name prefix when not stored on doc.
        const inferredTech: "IS" | "Clan" =
          doc.tech ?? (/^clan\s/i.test(doc.chassis) ? "Clan" : "IS");
        const chassis = doc.chassis.toLowerCase();
        const variant = doc.variant.toLowerCase();
        const stripped = chassis.replace(/^clan\s+/, "").replace(/^inner sphere\s+/, "");
        // Try increasingly loose config matches to find the canonical tonnage.
        const configEntry =
          configuredByPair.get(`${chassis}|${variant}`) ??
          configuredByPair.get(`${stripped}|${variant}`) ??
          [...configuredByPair.entries()].find(
            ([k]) => k.startsWith(`${stripped}|`) && k.endsWith(variant),
          )?.[1];
        return {
          key: doc.id,
          tech: inferredTech,
          class: (doc.class ?? configEntry?.class ?? "Medium") as WeightClass,
          chassis: doc.chassis,
          variant: doc.variant,
          tonnage: doc.tonnage ?? configEntry?.tonnage ?? 0,
        };
      }),
    [mechs, configuredByPair],
  );
  // Map doc-id -> MechDoc for fast tonnage lookup.
  const repositoryMechById = useMemo(() => {
    const map = new Map<string, MechDoc>();
    for (const mech of mechs) map.set(mech.id, mech);
    return map;
  }, [mechs]);
  const repoIdToAllKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const mech of mechs) {
      const chassis = mech.chassis.toLowerCase();
      const variant = mech.variant.toLowerCase();
      const stripped = chassis.replace(/^clan\s+/, "").replace(/^inner sphere\s+/, "");
      const configEntry =
        configuredByPair.get(`${chassis}|${variant}`) ??
        configuredByPair.get(`${stripped}|${variant}`) ??
        [...configuredByPair.entries()].find(([k]) => k.startsWith(`${stripped}|`) && k.endsWith(variant))?.[1];
      if (configEntry) map.set(mech.id, configEntry.key);
    }
    return map;
  }, [configuredByPair, mechs]);
  const repositoryMechIds = useMemo(() => new Set(mechs.map((m) => m.id)), [mechs]);
  const filteredRepoHierarchy = useMemo(() => {
    return repoHierarchy
      .map((weightClass) => ({
        ...weightClass,
        chassis: weightClass.chassis
          .map((chassis) => ({
            ...chassis,
            variants: chassis.variants
              .map((variant) => ({
                ...variant,
                builds: variant.builds.filter((build) => repositoryMechIds.has(build.id)),
              }))
              .filter((variant) => variant.builds.length > 0)
              .map((variant) => ({ ...variant, buildCount: variant.builds.length })),
          }))
          .filter((chassis) => chassis.variants.length > 0)
          .map((chassis) => ({
            ...chassis,
            buildCount: chassis.variants.reduce((sum, variant) => sum + variant.buildCount, 0),
          })),
      }))
      .filter((weightClass) => weightClass.chassis.length > 0)
      .map((weightClass) => ({
        ...weightClass,
        buildCount: weightClass.chassis.reduce((sum, chassis) => sum + chassis.buildCount, 0),
      }));
  }, [repoHierarchy, repositoryMechIds]);

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

  const refreshRepositoryData = async () => {
    const [mechDocs, hierarchy] = await Promise.all([getMechs(), getMechHierarchy()]);
    setMechs(mechDocs);
    setRepoHierarchy(hierarchy);
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
    return activeTemplate.rows.reduce((sum, row) => {
      const byId = mechLookup.get(row.mech)?.tonnage ?? repositoryMechById.get(row.mech)?.tonnage;
      const byConfig = configuredByKey.get(row.mech)?.tonnage;
      return sum + (byId ?? byConfig ?? 0);
    }, 0);
  }, [activeTemplate, configuredByKey, mechLookup, repositoryMechById]);

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

  const getBuildOptions = (chassis: string, variant: string): MechDoc[] => {
    if (!chassis) return [];
    const normalize = (value: string) => value.toLowerCase().replace(/^clan\s+/, "").replace(/^inner sphere\s+/, "").trim();
    const c = normalize(chassis);
    const v = variant.toLowerCase().trim();
    return mechs.filter((doc) => {
      if (normalize(doc.chassis) !== c) return false;
      if (!variant) return true;
      return doc.variant.toLowerCase().trim() === v;
    });
  };

  const formatBuildLabel = (weaponry: string, codename: string): string => {
    const w = weaponry.trim();
    const c = codename.trim();
    if (w && c) return `${w} | ${c}`;
    return w || c || "-";
  };

  const applyBuildToRow = (row: DeckRow, build: MechDoc): DeckRow => ({
    ...row,
    mech: build.id,
    chassis: build.chassis,
    variant: build.variant,
    weaponry: build.weaponry,
    codename: build.codename ?? "",
    buildUrl: build.link || build.buildUrl || "",
    role: build.role ?? row.role ?? "",
    skillTree: build.skillCode ?? row.skillTree ?? "",
    equipmentText: (build.metadata?.equipment ?? build.equipment ?? []).join(", "),
  });

  const setRowChassisVariant = (rowIndex: number, value: { mechId: string; chassis: string; variant: string }) => {
    updateRow(rowIndex, (row) => {
      return {
        ...row,
        mech: "",
        chassis: value.chassis,
        variant: value.variant,
        weaponry: "",
        codename: "",
        buildUrl: "",
      };
    });
  };

  const setRowBuild = (rowIndex: number, mechId: string) => {
    updateRow(rowIndex, (row) => {
      const build = mechLookup.get(mechId);
      if (!build) return { ...row, mech: mechId };
      return applyBuildToRow(row, build);
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

  // Explicit first-save for new (unsaved) decks.
  const saveNewDeck = async () => {
    if (!activeTemplate || isUuid(activeTemplate.id)) return;
    setDeckSaving(true);
    setDeckError("");
    try {
      const savedDoc = await saveDropDeck(toDropDeckUpsertInput(activeTemplate));
      const savedTemplate = toTemplate(savedDoc);
      syncedSignaturesRef.current.set(savedTemplate.id, templateSignature(savedTemplate));
      syncedTemplatesRef.current.set(savedTemplate.id, savedTemplate);
      setTemplates((previous) =>
        previous.map((template) => (template.id === activeTemplate.id ? savedTemplate : template)),
      );
      setSelectedTemplateId(savedTemplate.id);
    } catch (err: unknown) {
      setDeckError(err instanceof Error ? err.message : "Failed to save deck");
    } finally {
      setDeckSaving(false);
    }
  };

  const onMapChange = (map: DeckMap) => {
    setSelectedMap(map);
    const candidate = templates.find((template) => template.map === map);
    if (candidate) setSelectedTemplateId(candidate.id);
  };

  useEffect(() => {
    descriptionDraftRef.current = activeTemplate?.description ?? "";
  }, [activeTemplate?.id, activeTemplate?.description]);

  useEffect(() => {
    return () => {
      if (descriptionDebounceRef.current) {
        clearTimeout(descriptionDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (appView !== 0 || !activeTemplate) return;
    // Only autosave decks that already exist in Cosmos (UUID id).
    if (!isUuid(activeTemplate.id)) return;

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
                <InputLabel>Team</InputLabel>
                <Select
                  label="Team"
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

              <TextField
                size="small"
                label="Deck Name"
                value={activeTemplate?.name ?? ""}
                onChange={(event) =>
                  updateActiveTemplate((template) => ({
                    ...template,
                    name: event.target.value,
                  }))
                }
                sx={{ minWidth: 220 }}
              />

              <Button variant="outlined" onClick={createTemplateCopy}>
                Copy this template
              </Button>

              <Button variant="outlined" onClick={createFreshTemplate}>
                Fresh template
              </Button>

                {activeTemplate && !isUuid(activeTemplate.id) && (
                  <Button
                    variant="contained"
                    color="primary"
                    disabled={deckSaving}
                    onClick={saveNewDeck}
                  >
                    {deckSaving ? "Saving…" : "Save Deck"}
                  </Button>
                )}
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
                  {activeTemplate?.side ? ` | ${sideLabel(activeTemplate.side)}` : ""}
                  {formatUpdatedAt(activeTemplate?.updatedAt) ? ` | Updated ${formatUpdatedAt(activeTemplate?.updatedAt)}` : ""}
                  {deckSaving ? " | Syncing..." : ""}
                </Typography>
              </Stack>
              <Typography sx={{ color: isLight ? "#556887" : "#bfd0ff", fontWeight: 700 }}>Total Tonnage: {totalTonnage} t</Typography>
            </Box>

            <TableContainer
              sx={{
                overflowX: "auto",
                overflowY: "hidden",
                overscrollBehaviorX: "contain",
                WebkitOverflowScrolling: "touch",
                scrollbarGutter: "stable both-edges",
                scrollbarWidth: "thin",
                "&::-webkit-scrollbar": { height: 8 },
                "&::-webkit-scrollbar-track": {
                  background: isLight ? "rgba(170, 185, 206, 0.22)" : "rgba(97, 121, 176, 0.2)",
                  borderRadius: 999,
                },
                "&::-webkit-scrollbar-thumb": {
                  background: isLight ? "rgba(96, 120, 156, 0.45)" : "rgba(142, 170, 235, 0.38)",
                  borderRadius: 999,
                },
              }}
            >
              <Table
                size="medium"
                sx={{
                  minWidth: 980,
                  "& .MuiTableCell-root": {
                    borderBottom: isLight ? "1px solid rgba(114, 133, 162, 0.22)" : "1px solid rgba(130, 154, 217, 0.14)",
                    py: 1.25,
                  },
                  "& .MuiTableHead-root .MuiTableCell-root": {
                    fontSize: "0.72rem",
                    letterSpacing: "0.04em",
                  },
                  "& .MuiTableRow-hover:hover": {
                    backgroundColor: isLight ? "rgba(188, 204, 227, 0.08)" : "rgba(114, 145, 219, 0.08)",
                  },
                  "& .MuiInputBase-root:before": {
                    borderBottomColor: isLight ? "rgba(108, 128, 158, 0.5)" : "rgba(170, 187, 233, 0.32)",
                  },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 130 }}>Primary</TableCell>
                    <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 130 }}>Alternates</TableCell>
                      <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 35, maxWidth: 35 }}>Lance</TableCell>
                    <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 300 }}>
                      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
                        <Typography component="span" sx={{ fontWeight: 700, color: "inherit" }}>Mech</Typography>
                        <ToggleButtonGroup
                          exclusive
                          size="small"
                          value={mechSelectorSource}
                          onChange={(_, value: SelectorSource | null) => {
                            if (value) setMechSelectorSource(value);
                          }}
                        >
                          <ToggleButton value="repository">Repository</ToggleButton>
                          <ToggleButton value="all">All</ToggleButton>
                        </ToggleButtonGroup>
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 90 }}>Role</TableCell>
                    <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 240 }}>Build</TableCell>
                    <TableCell sx={{ color: isLight ? "#3d4f6f" : "#dce4ff", fontWeight: 700, minWidth: 180 }}>Skill Tree</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {activeTemplate?.rows.map((row, rowIndex) => {
                    const mechDetails = resolveMechDetails(row.mech, mechs, configuredByKey);
                    const mech = mechDetails.mech;
                    const rowChassis = row.chassis || mech?.chassis || "";
                    const rowVariant = row.variant || mech?.variant || "";
                    const buildOptions = getBuildOptions(rowChassis, rowVariant);
                    const selectedBuildId = mech?.id || row.mech || "";

                    return (
                      <TableRow key={row.slot} hover>
                        <TableCell sx={{ minWidth: 130 }}>
                          {editMode === "edit" ? (
                            <FormControl size="small" fullWidth variant="standard">
                              <Select
                                multiple
                                variant="standard"
                                value={row.primary}
                                displayEmpty
                                onChange={(event) => setPrimaryPilots(rowIndex, event.target.value as string[])}
                                renderValue={(value) => formatPilotDisplay(value as string[])}
                                sx={editSelectIconSx}
                              >
                                {PILOT_OPTIONS.map((pilot) => (
                                  <MenuItem key={pilot} value={pilot}>
                                    <Checkbox checked={row.primary.includes(pilot)} size="small" sx={{ mr: 1 }} />
                                    {getPilotShortcode(pilot)}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          ) : (
                            <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                              {(row.primary.length ? row.primary : ["-"]).map((pilot) => (
                                <Chip
                                  key={`primary-${row.slot}-${pilot}`}
                                  size="small"
                                  label={pilot === "-" ? "-" : getPilotShortcode(pilot)}
                                  sx={{
                                    height: 20,
                                    fontSize: "0.68rem",
                                    color: isLight ? "#425576" : "#d3ddfc",
                                    backgroundColor: isLight ? "rgba(145, 165, 196, 0.22)" : "rgba(111, 137, 197, 0.24)",
                                  }}
                                />
                              ))}
                            </Stack>
                          )}
                        </TableCell>
                        <TableCell sx={{ minWidth: 130 }}>
                          {editMode === "edit" ? (
                            <FormControl size="small" fullWidth variant="standard">
                              <Select
                                multiple
                                variant="standard"
                                value={getVisibleAlternates(row)}
                                displayEmpty
                                onChange={(event) => setAlternatePilots(rowIndex, event.target.value as string[])}
                                renderValue={(value) => formatPilotDisplay(value as string[])}
                                sx={editSelectIconSx}
                              >
                                {PILOT_OPTIONS.map((pilot) => (
                                  <MenuItem key={pilot} value={pilot}>
                                    <Checkbox checked={getVisibleAlternates(row).includes(pilot)} size="small" sx={{ mr: 1 }} />
                                    {getPilotShortcode(pilot)}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          ) : (
                            <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
                              {(getVisibleAlternates(row).length ? getVisibleAlternates(row) : ["-"]).map((pilot) => (
                                <Chip
                                  key={`alternate-${row.slot}-${pilot}`}
                                  size="small"
                                  label={pilot === "-" ? "-" : getPilotShortcode(pilot)}
                                  sx={{
                                    height: 20,
                                    fontSize: "0.68rem",
                                    color: isLight ? "#425576" : "#d3ddfc",
                                    backgroundColor: isLight ? "rgba(145, 165, 196, 0.22)" : "rgba(111, 137, 197, 0.24)",
                                  }}
                                />
                              ))}
                            </Stack>
                          )}
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
                              sx={editMode === "edit" ? editSelectIconSx : { "& .MuiSelect-icon": { display: "none" } }}
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
                          {editMode === "edit" ? (
                            <MechSelector
                              selectedMechId={row.mech}
                              selectedChassis={rowChassis}
                              selectedVariant={rowVariant}
                              allConfiguredMechs={configuredMechs}
                              repositoryMechs={repositoryMechs}
                              repoIdToAllKey={repoIdToAllKey}
                              source={mechSelectorSource}
                              onChange={(value) => setRowChassisVariant(rowIndex, value)}
                              disabled={false}
                            />
                          ) : (
                            <Typography sx={{ color: isLight ? "#4f6282" : "#d3ddfc" }}>
                              {mechDetails.label}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {editMode === "edit" ? (
                              <FormControl size="small" fullWidth variant="standard">
                                <Select
                                  variant="standard"
                                  value={row.role ?? ""}
                                  displayEmpty
                                  onChange={(event) => updateRow(rowIndex, (entry) => ({ ...entry, role: event.target.value }))}
                                  renderValue={(value) => value || (mech?.role ? `${mech.role} (from build)` : "-")}
                                  sx={editSelectIconSx}
                                >
                                  <MenuItem value="">{mech?.role ? `${mech.role} (from build)` : "- (none)"}</MenuItem>
                                  {["Light", "Medium", "Heavy", "Assault", "Support", "Sniper", "Brawler"].map((role) => (
                                    <MenuItem key={role} value={role}>{role}</MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                          ) : (
                            <Chip
                              size="small"
                              label={row.role || mech?.role || "-"}
                              sx={{
                                height: 22,
                                fontSize: "0.72rem",
                                color: isLight ? "#425576" : "#d3ddfc",
                                backgroundColor: isLight ? "rgba(145, 165, 196, 0.22)" : "rgba(111, 137, 197, 0.24)",
                              }}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {editMode === "edit" ? (
                            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                              <FormControl size="small" fullWidth variant="standard">
                                <Select
                                  variant="standard"
                                  value={selectedBuildId}
                                  displayEmpty
                                  disabled={!rowChassis || buildOptions.length === 0}
                                  onChange={(event) => setRowBuild(rowIndex, String(event.target.value))}
                                  sx={editSelectIconSx}
                                  renderValue={(value) => {
                                    const picked = buildOptions.find((b) => b.id === String(value));
                                    return formatBuildLabel(picked?.weaponry ?? row.weaponry ?? "", picked?.codename ?? row.codename ?? "");
                                  }}
                                >
                                  {buildOptions.map((build) => (
                                    <MenuItem key={build.id} value={build.id}>
                                      {formatBuildLabel(build.weaponry, build.codename ?? "")}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </Stack>
                          ) : null}
                          {editMode !== "edit" && (row.buildUrl || mech?.link || mech?.buildUrl) ? (
                              <Stack direction="column" spacing={0.5}>
                                <a
                              href={row.buildUrl || mech?.link || mech?.buildUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: isLight ? "#3a6fbd" : "#7fb3ff", fontSize: "0.8rem", display: "block" }}
                            >
                              {formatBuildLabel(row.weaponry || mech?.weaponry || "", row.codename || mech?.codename || "")}
                                </a>
                                  {mech?.link && (
                                  <a
                                      href={mech.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: isLight ? "#3a6fbd" : "#7fb3ff", fontSize: "0.75rem", display: "block" }}
                                  >
                                    Full Build
                                  </a>
                                )}
                              </Stack>
                          ) : editMode !== "edit" ? (
                            <Typography variant="body2" sx={{ color: isLight ? "#4f6282" : "#d3ddfc", fontSize: "0.78rem" }}>
                              {formatBuildLabel(row.weaponry || mech?.weaponry || "", row.codename || mech?.codename || "")}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {editMode === "edit" ? (
                            <TextField
                              variant="standard"
                              fullWidth
                              value={row.skillTree ?? ""}
                              onChange={(event) => updateRow(rowIndex, (entry) => ({ ...entry, skillTree: event.target.value }))}
                            />
                          ) : (
                            <Typography
                              variant="body2"
                              sx={{
                                color: isLight ? "#4f6282" : "#d3ddfc",
                                maxWidth: 140,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={row.skillTree || mech?.skillCode || ""}
                            >
                              {row.skillTree || mech?.skillCode || "-"}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
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
            p: 2,
            borderRadius: 2,
            border: isLight ? "1px solid rgba(114, 133, 162, 0.34)" : "1px solid rgba(130, 154, 217, 0.35)",
            background: isLight ? "rgba(236, 242, 249, 0.95)" : "rgba(11, 16, 33, 0.9)",
          }}
        >
          <Typography sx={{ color: isLight ? "#2f3f59" : "#edf4ff", fontWeight: 700, mb: 1.2 }}>Description</Typography>
          <TextField
            key={activeTemplateId || "description"}
            variant="standard"
            fullWidth
            multiline
            minRows={5}
            defaultValue={activeTemplate?.description ?? ""}
            disabled={editMode !== "edit"}
            onChange={(event) => {
              descriptionDraftRef.current = event.target.value;
              if (descriptionDebounceRef.current) {
                clearTimeout(descriptionDebounceRef.current);
              }
              descriptionDebounceRef.current = setTimeout(() => {
                updateActiveTemplate((template) => ({
                  ...template,
                  description:
                    template.description === descriptionDraftRef.current
                      ? template.description
                      : descriptionDraftRef.current,
                }));
              }, 1200);
            }}
            onBlur={() => {
              if (descriptionDebounceRef.current) {
                clearTimeout(descriptionDebounceRef.current);
              }
              updateActiveTemplate((template) => ({
                ...template,
                description:
                  template.description === descriptionDraftRef.current
                    ? template.description
                    : descriptionDraftRef.current,
              }));
            }}
          />
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
            <Box sx={{ px: 2, py: 1.5 }}>
              <RepositoryView
                hierarchy={filteredRepoHierarchy}
                loading={repoLoading}
                error={repoError}
                onAddBuild={() => setAddBuildDialogOpen(true)}
                mode={mode}
              />
            </Box>

            <AddBuildDialog
              open={addBuildDialogOpen}
              onClose={() => setAddBuildDialogOpen(false)}
              onBuildCreated={() => refreshRepositoryData()}
              mode={mode}
            />
          </Paper>
        )}
      </Container>
    </Box>
  );
}
