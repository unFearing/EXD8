import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  AppBar,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  Container,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  Tooltip,
} from "@mui/material";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { deleteDropDeck, getDropDecks, getMapConfigs, getMechs, getQuickslots, saveDropDeck, saveQuickslots } from "../api/client";
import { useMatchNightApi } from "../hooks/useMatchNightApi";
import { MechSelector } from "./MechSelector";
import type { DiscordUser } from "../hooks/useDiscordAuth";
import type {
  DeckMap,
  DropDeckEditable,
  DeckSide,
  DropDeckDoc,
  DropDeckUpsertInput,
  QuickslotEntry,
  QuickslotKey,
  ConfigMech,
  MapConfigDoc,
  MechDoc,
  MechsConfigFile,
  SelectorSource,
  WeightClass,
} from "../types/contracts";

type EditMode = "view" | "edit";
type MapTileMode = "static" | "iframe";
type TeamSide = DeckSide;
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
  user: DiscordUser | null;
  onLogout: () => void;
  hasRole: (roleId: string) => boolean;
};

const MAP_FALLBACK_OPTIONS: DeckMap[] = ["Alpine Peaks", "Bear Claw II", "Crimson Strait", "Frozen City", "River City"];
const SIDE_OPTIONS: TeamSide[] = ["1", "2", "either"];
const ROW_COUNT = 8;
const LANCE_OPTIONS: Lance[] = ["", "A", "B", "C"];
const DECK_AUTOSAVE_DELAY_MS = 1000;
const DECK_POLL_INTERVAL_MS = 5000;
const QUICKSLOT_KEYS: QuickslotKey[] = ["A", "B", "C", "D", "E"];
const MAX_VISIBLE_DECKS_PER_MAP = 3;
const DEFAULT_MAPROOM_URL = "https://maps.mwocomp.com/mwo2?room=IvLEFS2M7dVmsG";

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

function resolveMaproomEmbedUrl(selectedMap: DeckMap, selectedMapConfig?: MapConfigDoc): string {
  const configWithEmbed = selectedMapConfig as MapConfigDoc & {
    maproomUrl?: string;
    roomUrl?: string;
    iframeUrl?: string;
  };

  const rawUrl =
    configWithEmbed?.maproomUrl ||
    configWithEmbed?.roomUrl ||
    configWithEmbed?.iframeUrl ||
    DEFAULT_MAPROOM_URL;

  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.has("map")) {
      url.searchParams.set("map", selectedMap);
    }
    url.searchParams.set("embed", "1");
    return url.toString();
  } catch {
    return DEFAULT_MAPROOM_URL;
  }
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

function sortQuickslots(entries: QuickslotEntry[]): QuickslotEntry[] {
  return [...entries].sort((a, b) => QUICKSLOT_KEYS.indexOf(a.slot) - QUICKSLOT_KEYS.indexOf(b.slot));
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

export function DeckBoard({ mode, onToggleMode, user, onLogout, hasRole }: DeckBoardProps) {
  const navigate = useNavigate();
  const isLight = mode === "light";
  const syncedSignaturesRef = useRef<Map<string, string>>(new Map());
  const syncedTemplatesRef = useRef<Map<string, DeckTemplate>>(new Map());

  const [editMode, setEditMode] = useState<EditMode>("edit");
  const [mapConfigs, setMapConfigs] = useState<MapConfigDoc[]>([]);
  const [selectedMap, setSelectedMap] = useState<DeckMap>(MAP_FALLBACK_OPTIONS[0]);
  const [mapTileMode, setMapTileMode] = useState<MapTileMode>("static");
  const [iframeZoom, setIframeZoom] = useState(1);
  const [iframeOffsetX, setIframeOffsetX] = useState(0);
  const [iframeOffsetY, setIframeOffsetY] = useState(0);
  const [templates, setTemplates] = useState<DeckTemplate[]>(defaultTemplates(MAP_FALLBACK_OPTIONS));
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [quickslotId, setQuickslotId] = useState("quickslots-default");
  const [quickslots, setQuickslots] = useState<QuickslotEntry[]>([]);
  const [quickslotSaving, setQuickslotSaving] = useState(false);
  const [draggingQuickslot, setDraggingQuickslot] = useState<QuickslotKey | null>(null);
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckSaving, setDeckSaving] = useState(false);
  const [deckError, setDeckError] = useState("");
  const [mechs, setMechs] = useState<MechDoc[]>([]);
  const [configuredMechs, setConfiguredMechs] = useState<ConfigMech[]>([]);
  const [mechSelectorSource] = useState<SelectorSource>("repository");

  void hasRole;
  const canDelete = user?.appRole === "TL";
  const { error } = useMatchNightApi();

  const mapOptions = useMemo<DeckMap[]>(() => {
    if (!mapConfigs.length) return MAP_FALLBACK_OPTIONS;
    return mapConfigs.map((entry) => entry.name);
  }, [mapConfigs]);

  const selectedMapConfig = useMemo(() => mapConfigs.find((entry) => entry.name === selectedMap), [mapConfigs, selectedMap]);
  const maproomEmbedUrl = useMemo(
    () => resolveMaproomEmbedUrl(selectedMap, selectedMapConfig),
    [selectedMap, selectedMapConfig],
  );

  useEffect(() => {
    setIframeZoom(1);
    setIframeOffsetX(0);
    setIframeOffsetY(0);
  }, [selectedMap]);

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

    let cancelled = false;
    setDeckLoading(true);
    setDeckError("");

    Promise.all([getDropDecks(), getQuickslots()])
      .then(([docs, quickslotDoc]) => {
        if (cancelled) return;

        setQuickslotId(quickslotDoc.id || "quickslots-default");
        setQuickslots(sortQuickslots(quickslotDoc.slots || []));

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
  }, [mapOptions]);

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

  const templatesForSelection = useMemo(
    () => templates.filter((template) => template.map === selectedMap),
    [templates, selectedMap],
  );

  const mapQuickslotLookup = useMemo(() => {
    const lookup = new Map<QuickslotKey, QuickslotEntry>();
    for (const entry of quickslots) {
      if (entry.map === selectedMap) {
        lookup.set(entry.slot, entry);
      }
    }
    return lookup;
  }, [quickslots, selectedMap]);

  const fixedMapQuickslots = useMemo(
    () => QUICKSLOT_KEYS.map((slot) => mapQuickslotLookup.get(slot) ?? { map: selectedMap, slot }),
    [mapQuickslotLookup, selectedMap],
  );

  const mapQuickslots = useMemo(
    () => fixedMapQuickslots.filter((entry) => entry.deckId).slice(0, MAX_VISIBLE_DECKS_PER_MAP),
    [fixedMapQuickslots],
  );

  useEffect(() => {
    if (!templatesForSelection.length) return;
    const exists = templatesForSelection.some((template) => template.id === selectedTemplateId);
    if (!exists) setSelectedTemplateId(templatesForSelection[0].id);
  }, [templatesForSelection, selectedTemplateId]);

  const activeTemplate =
    templatesForSelection.find((template) => template.id === selectedTemplateId) ?? templatesForSelection[0];
  const computeTemplateTonnage = (template?: DeckTemplate) => {
    if (!template) return 0;
    return template.rows.reduce((sum, row) => {
      const byId = mechLookup.get(row.mech)?.tonnage ?? repositoryMechById.get(row.mech)?.tonnage;
      const byConfig = configuredByKey.get(row.mech)?.tonnage;
      return sum + (byId ?? byConfig ?? 0);
    }, 0);
  };

  const updateTemplateById = (templateId: string, updater: (template: DeckTemplate) => DeckTemplate) => {
    setTemplates((previous) => previous.map((template) => (template.id === templateId ? updater(template) : template)));
  };

  const updateRow = (templateId: string, rowIndex: number, updater: (row: DeckRow) => DeckRow) => {
    updateTemplateById(templateId, (template) => ({
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

  const setRowChassisVariant = (templateId: string, rowIndex: number, value: { mechId: string; chassis: string; variant: string }) => {
    updateRow(templateId, rowIndex, (row) => {
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

  const setRowBuild = (templateId: string, rowIndex: number, mechId: string) => {
    updateRow(templateId, rowIndex, (row) => {
      const build = mechLookup.get(mechId);
      if (!build) return { ...row, mech: mechId };
      return applyBuildToRow(row, build);
    });
  };

  const getVisibleAlternates = (row: DeckRow): string[] =>
    row.alternates.filter((pilot) => !row.primary.includes(pilot));

  const setPrimaryPilots = (templateId: string, rowIndex: number, primary: string[]) => {
    updateRow(templateId, rowIndex, (entry) => ({ ...entry, primary }));
  };

  const setAlternatePilots = (templateId: string, rowIndex: number, alternatesVisible: string[]) => {
    updateRow(templateId, rowIndex, (entry) => {
      const hiddenDesignated = entry.alternates.filter((pilot) => entry.primary.includes(pilot));
      return { ...entry, alternates: Array.from(new Set([...alternatesVisible, ...hiddenDesignated])) };
    });
  };

  const replaceQuickslotDeckId = (previousId: string, nextId: string) => {
    const next = quickslots.map((entry) => (entry.deckId === previousId ? { ...entry, deckId: nextId } : entry));
    void persistQuickslots(next);
  };

  const ensureDeckIdForQuickslot = async (deckId?: string): Promise<string | undefined> => {
    if (!deckId) return undefined;
    if (isUuid(deckId)) return deckId;

    const localTemplate = templates.find((template) => template.id === deckId);
    if (!localTemplate) return deckId;

    const savedDoc = await saveDropDeck(toDropDeckUpsertInput(localTemplate));
    const savedTemplate = toTemplate(savedDoc);
    syncedSignaturesRef.current.set(savedTemplate.id, templateSignature(savedTemplate));
    syncedTemplatesRef.current.set(savedTemplate.id, savedTemplate);
    setTemplates((previous) =>
      previous.map((template) => (template.id === localTemplate.id ? savedTemplate : template)),
    );
    if (selectedTemplateId === localTemplate.id) {
      setSelectedTemplateId(savedTemplate.id);
    }
    return savedTemplate.id;
  };

  const persistQuickslots = async (entries: QuickslotEntry[]) => {
    const sorted = sortQuickslots(entries).slice(0, 5);
    setQuickslots(sorted);
    setQuickslotSaving(true);
    try {
      const saved = await saveQuickslots({ id: quickslotId, slots: sorted });
      setQuickslotId(saved.id || quickslotId);
      setQuickslots(sortQuickslots(saved.slots || []));
      setDeckError("");
    } catch (err: unknown) {
      setDeckError(err instanceof Error ? err.message : "Failed to save quickslots");
    } finally {
      setQuickslotSaving(false);
    }
  };

  const setQuickslotDeck = async (slot: QuickslotKey, deckId?: string) => {
    try {
      const resolvedDeckId = await ensureDeckIdForQuickslot(deckId);
      const rest = quickslots.filter((entry) => !(entry.map === selectedMap && entry.slot === slot));
      const next = resolvedDeckId ? [...rest, { map: selectedMap, slot, deckId: resolvedDeckId }] : rest;
      void persistQuickslots(next);
    } catch (err: unknown) {
      setDeckError(err instanceof Error ? err.message : "Failed to assign deck to quickslot");
    }
  };

  const reorderQuickslotDecks = (sourceSlot: QuickslotKey, targetSlot: QuickslotKey) => {
    if (sourceSlot === targetSlot) {
      return;
    }

    const slotDeckId = mapQuickslotLookup.get(sourceSlot)?.deckId;
    const targetDeckId = mapQuickslotLookup.get(targetSlot)?.deckId;
    const rest = quickslots.filter(
      (entry) => !(entry.map === selectedMap && (entry.slot === sourceSlot || entry.slot === targetSlot)),
    );

    const next = [...rest];
    if (targetDeckId) {
      next.push({ map: selectedMap, slot: sourceSlot, deckId: targetDeckId });
    }
    if (slotDeckId) {
      next.push({ map: selectedMap, slot: targetSlot, deckId: slotDeckId });
    }

    void persistQuickslots(next);
  };

  const addQuickslotForMap = () => {
    if (mapQuickslots.length >= MAX_VISIBLE_DECKS_PER_MAP) return;
    const nextSlot = QUICKSLOT_KEYS.find((key) => !mapQuickslotLookup.get(key)?.deckId);
    if (!nextSlot) return;
    const fallbackDeck = templatesForSelection.find((template) => isUuid(template.id)) ?? templatesForSelection[0];
    void setQuickslotDeck(nextSlot, fallbackDeck?.id);
  };

  const clearQuickslotDeck = (slot: QuickslotKey) => {
    void setQuickslotDeck(slot, undefined);
  };

  const onMapChange = (map: DeckMap) => {
    setSelectedMap(map);
    const candidate = templates.find((template) => template.map === map);
    if (candidate) setSelectedTemplateId(candidate.id);
  };

  const handleDeleteDeck = async (template: DeckTemplate) => {
    if (!canDelete) {
      setDeckError("Only TL can delete decks.");
      return;
    }

    if (!isUuid(template.id)) {
      setDeckError("Deck must be saved before it can be deleted.");
      return;
    }

    const confirmed = window.confirm(`Delete deck \"${template.name}\"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteDropDeck(template.id);
      syncedSignaturesRef.current.delete(template.id);
      syncedTemplatesRef.current.delete(template.id);
      const filteredQuickslots = quickslots.filter((entry) => entry.deckId !== template.id);
      await persistQuickslots(filteredQuickslots);
      setTemplates((previous) => previous.filter((entry) => entry.id !== template.id));
      setSelectedTemplateId((previous) => (previous === template.id ? "" : previous));
      setDeckError("");
    } catch (err: unknown) {
      let errorMessage = "Failed to delete deck";
      if (err instanceof Error) {
        const statusCode = (err as Error & { status?: number }).status;
        if (statusCode === 403) {
          errorMessage = "You don't have permission to delete decks (TL role required)";
        } else if (statusCode === 404) {
          errorMessage = "Deck not found or was already deleted";
        } else if (statusCode === 400) {
          errorMessage = "Invalid deck ID";
        } else if (statusCode === 500) {
          errorMessage = "Server error - could not delete deck";
        } else {
          errorMessage = err.message;
        }
      }
      setDeckError(errorMessage);
    }
  };

  useEffect(() => {
    const inUseTemplateIds = new Set<string>([
      selectedTemplateId,
      ...quickslots.map((entry) => entry.deckId).filter((value): value is string => Boolean(value)),
    ]);

    const dirtyTemplate = templates.find((template) => {
      if (!inUseTemplateIds.has(template.id)) return false;
      const syncedSignature = syncedSignaturesRef.current.get(template.id);
      return syncedSignature !== templateSignature(template);
    });

    if (!dirtyTemplate || deckSaving) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setDeckSaving(true);
      try {
        const baseTemplate = isUuid(dirtyTemplate.id) ? syncedTemplatesRef.current.get(dirtyTemplate.id) : undefined;
        const savedDoc = await saveDropDeck(toDropDeckUpsertInput(dirtyTemplate, baseTemplate));
        const savedTemplate = toTemplate(savedDoc);
        syncedSignaturesRef.current.set(savedTemplate.id, templateSignature(savedTemplate));
        syncedTemplatesRef.current.set(savedTemplate.id, savedTemplate);

        if (savedTemplate.id !== dirtyTemplate.id) {
          syncedSignaturesRef.current.delete(dirtyTemplate.id);
          syncedTemplatesRef.current.delete(dirtyTemplate.id);
          replaceQuickslotDeckId(dirtyTemplate.id, savedTemplate.id);
          if (selectedTemplateId === dirtyTemplate.id) {
            setSelectedTemplateId(savedTemplate.id);
          }
        }

        setTemplates((previous) =>
          previous.map((template) => (template.id === dirtyTemplate.id ? savedTemplate : template)),
        );
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
              previous.map((template) => (template.id === dirtyTemplate.id ? latestTemplate : template)),
            );
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
  }, [templates, quickslots, selectedTemplateId, deckSaving]);

  useEffect(() => {

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
  }, [activeTemplate, deckSaving]);

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
        <Box sx={{ px: { xs: 1, md: 2 }, py: 1, display: "grid", gap: 1.1 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <Stack direction="row" spacing={1.2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
              <Typography sx={{ color: isLight ? "#2f3e58" : "#eff5ff", fontWeight: 700, mr: 0.5 }}>
                EXDEATE
              </Typography>

              <Tabs
                value="dropDecks"
                onChange={(_, value: string) => {
                  if (value === "repository") {
                    navigate("/repository");
                  }
                }}
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  minHeight: 34,
                  "& .MuiTab-root": { color: isLight ? "#566987" : "#cbd6f6", minHeight: 34, py: 0 },
                  "& .Mui-selected": { color: isLight ? "#26364f" : "#ffffff" },
                }}
              >
                <Tab label="Drop Decks" value="dropDecks" />
                <Tab label="Repository" value="repository" />
              </Tabs>
            </Stack>

            <Stack direction="row" spacing={1.2} sx={{ ml: "auto", alignItems: "center", flexWrap: "wrap" }}>
              {user && (
                <Typography sx={{ color: isLight ? "#556987" : "#cbd6f6", fontSize: "0.9rem", display: { xs: "none", sm: "block" } }}>
                  {user.username}
                </Typography>
              )}

              <Button
                variant="contained"
                size="small"
                onClick={onLogout}
                sx={{
                  backgroundColor: "#5865F2",
                  color: "#fff",
                  textTransform: "none",
                  fontWeight: 600,
                  "&:hover": { backgroundColor: "#4752C4" },
                }}
              >
                Discord Logout
              </Button>

              <ButtonGroup
                size="small"
                sx={{
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
            </Stack>
          </Stack>

          <Tabs
            value={selectedMap}
            onChange={(_, value: DeckMap) => onMapChange(value)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 34,
              "& .MuiTab-root": { color: isLight ? "#566987" : "#cbd6f6", minHeight: 34, py: 0 },
              "& .Mui-selected": { color: isLight ? "#26364f" : "#ffffff" },
            }}
          >
            {mapOptions.map((map) => (
              <Tab key={map} label={map} value={map} />
            ))}
          </Tabs>

        </Box>
      </AppBar>

      <Container maxWidth={false} sx={{ pt: 2, px: { xs: 1, md: 2 } }}>
        <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            {deckError && <Alert severity="error">{deckError}</Alert>}
            {deckLoading && <Alert severity="info">Loading drop decks...</Alert>}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2 }}>
              <Paper
                elevation={0}
                sx={{
                  p: 1.2,
                  borderRadius: 2,
                  overflow: "hidden",
                  border: isLight ? "1px solid rgba(114, 133, 162, 0.34)" : "1px solid rgba(130, 154, 217, 0.35)",
                  background: isLight
                    ? "linear-gradient(180deg, rgba(227, 234, 244, 0.9), rgba(218, 227, 239, 0.97))"
                    : "linear-gradient(180deg, rgba(16, 27, 56, 0.88), rgba(10, 16, 32, 0.96))",
                }}
              >
                <Stack spacing={1}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    sx={{
                      alignItems: "center",
                      justifyContent: "space-between",
                      px: 0.4,
                    }}
                  >
                    <Typography variant="caption" sx={{ color: isLight ? "#5b6f90" : "#b8c9ef", fontWeight: 700, letterSpacing: "0.03em" }}>
                      MAP VIEW
                    </Typography>
                    <Stack direction="row" spacing={0.8} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                      <Button
                        variant={mapTileMode === "static" ? "contained" : "outlined"}
                        size="small"
                        onClick={() => setMapTileMode("static")}
                        sx={{ textTransform: "none" }}
                      >
                        Static
                      </Button>
                      <Button
                        variant={mapTileMode === "iframe" ? "contained" : "outlined"}
                        size="small"
                        onClick={() => setMapTileMode("iframe")}
                        sx={{ textTransform: "none" }}
                      >
                        Maproom
                      </Button>
                      {mapTileMode === "iframe" && (
                        <>
                          <TextField
                            label="Zoom"
                            type="number"
                            size="small"
                            value={iframeZoom}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (Number.isNaN(next)) return;
                              setIframeZoom(Math.max(0.6, Math.min(2.2, next)));
                            }}
                            sx={{ width: 86 }}
                            slotProps={{ htmlInput: { step: 0.1, min: 0.6, max: 2.2 } }}
                          />
                          <TextField
                            label="Pan X"
                            type="number"
                            size="small"
                            value={iframeOffsetX}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (Number.isNaN(next)) return;
                              setIframeOffsetX(Math.max(-220, Math.min(220, next)));
                            }}
                            sx={{ width: 86 }}
                            slotProps={{ htmlInput: { step: 10, min: -220, max: 220 } }}
                          />
                          <TextField
                            label="Pan Y"
                            type="number"
                            size="small"
                            value={iframeOffsetY}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (Number.isNaN(next)) return;
                              setIframeOffsetY(Math.max(-220, Math.min(220, next)));
                            }}
                            sx={{ width: 86 }}
                            slotProps={{ htmlInput: { step: 10, min: -220, max: 220 } }}
                          />
                        </>
                      )}
                    </Stack>
                  </Stack>

                  <Box
                    sx={{
                      minHeight: { xs: 120, lg: 190 },
                      aspectRatio: "1 / 1",
                      position: "relative",
                      borderRadius: 1.5,
                      overflow: "hidden",
                      border: isLight ? "1px solid rgba(101, 122, 153, 0.34)" : "1px solid rgba(159, 178, 240, 0.24)",
                      backgroundPosition: "center",
                      backgroundRepeat: "no-repeat",
                      backgroundBlendMode: "overlay",
                      backgroundImage:
                        `${isLight
                          ? "linear-gradient(rgba(99,119,148,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(99,119,148,0.16) 1px, transparent 1px)"
                          : "linear-gradient(rgba(207,221,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(207,221,255,0.08) 1px, transparent 1px)"}${mapTileMode === "static" && selectedMapConfig?.imageUrl ? `, url(${selectedMapConfig.imageUrl})` : ""}`,
                      backgroundSize: mapTileMode === "static" && selectedMapConfig?.imageUrl ? "30px 30px, 30px 30px, cover" : "30px 30px, 30px 30px",
                    }}
                  >
                    {mapTileMode === "static" ? (
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
                    ) : (
                      <>
                        <Box
                          component="iframe"
                          src={maproomEmbedUrl}
                          title={`Maproom - ${selectedMap}`}
                          loading="lazy"
                          sx={{
                            position: "absolute",
                            left: "50%",
                            top: "50%",
                            width: "165%",
                            height: "165%",
                            border: 0,
                            transform: `translate(calc(-50% + ${iframeOffsetX}px), calc(-50% + ${iframeOffsetY}px)) scale(${iframeZoom})`,
                            transformOrigin: "center",
                            pointerEvents: "none",
                          }}
                        />
                        <Box
                          sx={{
                            position: "absolute",
                            inset: 0,
                            pointerEvents: "none",
                            background: isLight ? "rgba(226, 235, 246, 0.08)" : "rgba(7, 12, 24, 0.16)",
                          }}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            position: "absolute",
                            right: 8,
                            bottom: 6,
                            px: 0.8,
                            py: 0.2,
                            borderRadius: 1,
                            background: isLight ? "rgba(231, 239, 249, 0.88)" : "rgba(8, 13, 27, 0.85)",
                            color: isLight ? "#4f6385" : "#aec3ef",
                            fontWeight: 600,
                          }}
                        >
                          Read-only embed
                        </Typography>
                      </>
                    )}
                  </Box>
                </Stack>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  p: 1.4,
                  borderRadius: 2,
                  border: isLight ? "1px solid rgba(114, 133, 162, 0.34)" : "1px solid rgba(130, 154, 217, 0.35)",
                  background: isLight ? "rgba(236, 242, 249, 0.95)" : "rgba(11, 16, 33, 0.9)",
                }}
              >
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                  <Typography variant="caption" sx={{ color: isLight ? "#5b6f90" : "#b8c9ef", fontWeight: 700, letterSpacing: "0.03em" }}>
                    QUICKSLOTS ({selectedMap})
                  </Typography>
                  <Button variant="outlined" size="small" onClick={addQuickslotForMap} disabled={mapQuickslots.length >= MAX_VISIBLE_DECKS_PER_MAP}>
                    + Add Deck Slot
                  </Button>
                </Stack>
                <Stack spacing={1}>
                  {mapQuickslots.length === 0 && (
                    <Typography variant="body2" sx={{ color: isLight ? "#60779d" : "#a9bfef" }}>
                      No deck slots yet for this map. Click + Add Deck Slot.
                    </Typography>
                  )}
                  {fixedMapQuickslots.map((entry) => (
                    <Stack
                      key={`${entry.map}-${entry.slot}`}
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      sx={{
                        alignItems: "center",
                        borderRadius: 1,
                        background: draggingQuickslot === entry.slot
                          ? (isLight ? "rgba(83, 124, 186, 0.08)" : "rgba(127, 179, 255, 0.12)")
                          : "transparent",
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggingQuickslot) {
                          reorderQuickslotDecks(draggingQuickslot, entry.slot);
                        }
                        setDraggingQuickslot(null);
                      }}
                    >
                      <Stack direction="row" spacing={0.2} sx={{ alignItems: "center", minWidth: 90 }}>
                        <Tooltip title={entry.deckId ? "Drag to reorder deck slots" : "Assign a deck to enable drag reorder"}>
                          <Box
                            draggable={Boolean(entry.deckId)}
                            onDragStart={() => setDraggingQuickslot(entry.slot)}
                            onDragEnd={() => setDraggingQuickslot(null)}
                            sx={{
                              display: "inline-flex",
                              cursor: entry.deckId ? "grab" : "not-allowed",
                              opacity: entry.deckId ? 1 : 0.45,
                              px: 0.2,
                            }}
                          >
                            <DragIndicatorIcon fontSize="small" sx={{ color: isLight ? "#5e7397" : "#9ab5ec" }} />
                          </Box>
                        </Tooltip>
                        <Typography sx={{ fontWeight: 700, color: isLight ? "#2f3f59" : "#d8e4ff" }}>
                          {entry.slot}
                        </Typography>
                      </Stack>
                      <FormControl size="small" sx={{ flex: 1, minWidth: 220 }}>
                        <InputLabel>Deck</InputLabel>
                        <Select
                          label="Deck"
                          value={entry.deckId ?? ""}
                          onChange={(event) => {
                            const value = String(event.target.value);
                            if (value === "__new__") {
                              const fresh = createTemplate(selectedMap, activeTemplate?.side ?? "either", templatesForSelection.length + 1);
                              setTemplates((previous) => [...previous, fresh]);
                              setSelectedTemplateId(fresh.id);
                              setQuickslotDeck(entry.slot, fresh.id);
                              return;
                            }
                            setQuickslotDeck(entry.slot, value || undefined);
                            if (value) setSelectedTemplateId(value);
                          }}
                        >
                          <MenuItem value="">Unassigned</MenuItem>
                          <MenuItem value="__new__">Create fresh deck</MenuItem>
                          {templatesForSelection.map((template) => (
                            <MenuItem key={template.id} value={template.id}>
                              {template.name} ({sideLabel(template.side)})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Button variant="text" color="inherit" onClick={() => clearQuickslotDeck(entry.slot)} disabled={!entry.deckId}>
                        Clear
                      </Button>
                    </Stack>
                  ))}
                  {quickslotSaving && (
                    <Typography variant="caption" sx={{ color: isLight ? "#5b6f90" : "#b8c9ef" }}>Syncing quickslots...</Typography>
                  )}
                </Stack>
              </Paper>
            </Box>

            {mapQuickslots.map((slotEntry) => {
              const template = templatesForSelection.find((item) => item.id === slotEntry.deckId);
              if (!template) {
                return null;
              }

              return (
                <Stack key={slotEntry.slot} spacing={1.2}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 1.6,
                      borderRadius: 2,
                      border: isLight ? "1px solid rgba(114, 133, 162, 0.34)" : "1px solid rgba(130, 154, 217, 0.35)",
                      background: isLight ? "rgba(236, 242, 249, 0.95)" : "rgba(11, 16, 33, 0.9)",
                    }}
                  >
                    <Typography variant="caption" sx={{ color: isLight ? "#5b6f90" : "#b8c9ef", fontWeight: 700, letterSpacing: "0.03em" }}>
                      STRAT DESCRIPTION | SLOT {slotEntry.slot}
                    </Typography>
                    <TextField
                      variant="outlined"
                      fullWidth
                      multiline
                      minRows={4}
                      value={template.description ?? ""}
                      disabled={editMode !== "edit"}
                      sx={{ mt: 1 }}
                      onChange={(event) => {
                        updateTemplateById(template.id, (current) => ({ ...current, description: event.target.value }));
                      }}
                    />
                  </Paper>

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
                          Deck Table ({selectedMap}) | Slot {slotEntry.slot}
                        </Typography>
                        <Typography variant="body2" sx={{ color: isLight ? "#556887" : "#bfd0ff" }}>
                          {formatUpdatedAt(template.updatedAt) ? ` | Updated ${formatUpdatedAt(template.updatedAt)}` : ""}
                          {deckSaving ? " | Syncing..." : ""}
                        </Typography>
                      </Stack>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                        <TextField
                          size="small"
                          label="Deck Name"
                          value={template.name ?? ""}
                          disabled={editMode !== "edit"}
                          onChange={(event) =>
                            updateTemplateById(template.id, (current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          sx={{ minWidth: 220 }}
                        />
                        <FormControl size="small" sx={{ minWidth: 130 }}>
                          <InputLabel>Team</InputLabel>
                          <Select
                            label="Team"
                            value={template.side}
                            disabled={editMode !== "edit"}
                            onChange={(event) =>
                              updateTemplateById(template.id, (current) => ({
                                ...current,
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
                        <Typography sx={{ color: isLight ? "#556887" : "#bfd0ff", fontWeight: 700 }}>
                          Total Tonnage: {computeTemplateTonnage(template)} t
                        </Typography>
                        {canDelete && (
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            onClick={() => {
                              void handleDeleteDeck(template);
                            }}
                          >
                            Delete Deck
                          </Button>
                        )}
                      </Stack>
                    </Box>

                    <Box sx={{ p: 1.5, overflowX: "auto" }}>
                      <Box sx={{ minWidth: 1560 }}>
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "180px 180px 80px 360px 150px 320px 220px",
                            gap: 1,
                            px: 1,
                            pb: 0.8,
                            borderBottom: isLight ? "1px solid rgba(122, 143, 174, 0.25)" : "1px solid rgba(120, 146, 210, 0.2)",
                          }}
                        >
                          {["Primary", "Alternates", "Lance", "Mech", "Role", "Build", "Skill Tree"].map((header) => (
                            <Typography
                              key={header}
                              variant="caption"
                              sx={{ color: isLight ? "#4f6282" : "#c9d8ff", fontWeight: 700, letterSpacing: "0.02em" }}
                            >
                              {header}
                            </Typography>
                          ))}
                        </Box>

                        <Stack spacing={0.6} sx={{ pt: 0.8 }}>
                          {template.rows.map((row, rowIndex) => {
                            const mechDetails = resolveMechDetails(row.mech, mechs, configuredByKey);
                            const mech = mechDetails.mech;
                            const rowChassis = row.chassis || mech?.chassis || "";
                            const rowVariant = row.variant || mech?.variant || "";
                            const buildOptions = getBuildOptions(rowChassis, rowVariant);
                            const selectedBuildId = mech?.id || row.mech || "";

                            return (
                              <Box
                                key={row.slot}
                                sx={{
                                  display: "grid",
                                  gridTemplateColumns: "180px 180px 80px 360px 150px 320px 220px",
                                  gap: 1,
                                  alignItems: "center",
                                  px: 1,
                                  py: 0.7,
                                  borderRadius: 1.2,
                                  border: isLight ? "1px solid rgba(122, 143, 174, 0.22)" : "1px solid rgba(120, 146, 210, 0.22)",
                                  background: isLight ? "rgba(226, 234, 244, 0.34)" : "rgba(18, 27, 54, 0.36)",
                                }}
                              >
                                <FormControl size="small" fullWidth variant="standard">
                                  <Select
                                    multiple
                                    variant="standard"
                                    value={row.primary}
                                    displayEmpty
                                    disabled={editMode !== "edit"}
                                    onChange={(event) => setPrimaryPilots(template.id, rowIndex, event.target.value as string[])}
                                    renderValue={(value) => formatPilotDisplay((value as string[]) || []) || "-"}
                                    sx={editMode === "edit" ? editSelectIconSx : { "& .MuiSelect-icon": { display: "none" } }}
                                  >
                                    {PILOT_OPTIONS.map((pilot) => (
                                      <MenuItem key={pilot} value={pilot}>
                                        <Checkbox checked={row.primary.includes(pilot)} size="small" sx={{ mr: 1 }} />
                                        {getPilotShortcode(pilot)}
                                      </MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>

                                <FormControl size="small" fullWidth variant="standard">
                                  <Select
                                    multiple
                                    variant="standard"
                                    value={getVisibleAlternates(row)}
                                    displayEmpty
                                    disabled={editMode !== "edit"}
                                    onChange={(event) => setAlternatePilots(template.id, rowIndex, event.target.value as string[])}
                                    renderValue={(value) => formatPilotDisplay((value as string[]) || []) || "-"}
                                    sx={editMode === "edit" ? editSelectIconSx : { "& .MuiSelect-icon": { display: "none" } }}
                                  >
                                    {PILOT_OPTIONS.map((pilot) => (
                                      <MenuItem key={pilot} value={pilot}>
                                        <Checkbox checked={getVisibleAlternates(row).includes(pilot)} size="small" sx={{ mr: 1 }} />
                                        {getPilotShortcode(pilot)}
                                      </MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>

                                <FormControl size="small" fullWidth variant="standard">
                                  <Select
                                    variant="standard"
                                    value={row.lance}
                                    displayEmpty
                                    disabled={editMode !== "edit"}
                                    onChange={(event) => updateRow(template.id, rowIndex, (entry) => ({ ...entry, lance: event.target.value as Lance }))}
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

                                {editMode === "edit" ? (
                                  <MechSelector
                                    selectedMechId={row.mech}
                                    selectedChassis={rowChassis}
                                    selectedVariant={rowVariant}
                                    allConfiguredMechs={configuredMechs}
                                    repositoryMechs={repositoryMechs}
                                    repoIdToAllKey={repoIdToAllKey}
                                    source={mechSelectorSource}
                                    onChange={(value) => setRowChassisVariant(template.id, rowIndex, value)}
                                    disabled={false}
                                  />
                                ) : (
                                  <Typography sx={{ color: isLight ? "#4f6282" : "#d3ddfc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {mechDetails.label || "-"}
                                  </Typography>
                                )}

                                <FormControl size="small" fullWidth variant="standard">
                                  <Select
                                    variant="standard"
                                    value={row.role ?? ""}
                                    displayEmpty
                                    disabled={editMode !== "edit"}
                                    onChange={(event) => updateRow(template.id, rowIndex, (entry) => ({ ...entry, role: event.target.value }))}
                                    renderValue={(value) => value || (mech?.role ? `${mech.role} (from build)` : "-")}
                                    sx={editMode === "edit" ? editSelectIconSx : { "& .MuiSelect-icon": { display: "none" } }}
                                  >
                                    <MenuItem value="">{mech?.role ? `${mech.role} (from build)` : "- (none)"}</MenuItem>
                                    {["Light", "Medium", "Heavy", "Assault", "Support", "Sniper", "Brawler", "Juggernaut"].map((role) => (
                                      <MenuItem key={role} value={role}>{role}</MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>

                                {editMode === "edit" ? (
                                  <FormControl size="small" fullWidth variant="standard">
                                    <Select
                                      variant="standard"
                                      value={selectedBuildId}
                                      displayEmpty
                                      disabled={!rowChassis || buildOptions.length === 0}
                                      onChange={(event) => setRowBuild(template.id, rowIndex, String(event.target.value))}
                                      sx={editSelectIconSx}
                                      renderValue={(value) => {
                                        const picked = buildOptions.find((b) => b.id === String(value));
                                        return formatBuildLabel(picked?.weaponry ?? row.weaponry ?? "", picked?.codename ?? row.codename ?? "") || "-";
                                      }}
                                    >
                                      {buildOptions.map((build) => (
                                        <MenuItem key={build.id} value={build.id}>
                                          {formatBuildLabel(build.weaponry, build.codename ?? "")}
                                        </MenuItem>
                                      ))}
                                    </Select>
                                  </FormControl>
                                ) : (row.buildUrl || mech?.link || mech?.buildUrl) ? (
                                  <a
                                    href={row.buildUrl || mech?.link || mech?.buildUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: isLight ? "#3a6fbd" : "#7fb3ff", fontSize: "0.8rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}
                                  >
                                    {formatBuildLabel(row.weaponry || mech?.weaponry || "", row.codename || mech?.codename || "") || "-"}
                                  </a>
                                ) : (
                                  <Typography variant="body2" sx={{ color: isLight ? "#4f6282" : "#d3ddfc", fontSize: "0.78rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {formatBuildLabel(row.weaponry || mech?.weaponry || "", row.codename || mech?.codename || "") || "-"}
                                  </Typography>
                                )}

                                {editMode === "edit" ? (
                                  <TextField
                                    variant="standard"
                                    fullWidth
                                    value={row.skillTree ?? ""}
                                    onChange={(event) => updateRow(template.id, rowIndex, (entry) => ({ ...entry, skillTree: event.target.value }))}
                                  />
                                ) : (
                                  <Typography
                                    variant="body2"
                                    sx={{ color: isLight ? "#4f6282" : "#d3ddfc", fontSize: "0.85rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                                    title={row.skillTree || mech?.skillCode || ""}
                                  >
                                    {row.skillTree || mech?.skillCode || "-"}
                                  </Typography>
                                )}
                              </Box>
                            );
                          })}
                        </Stack>
                      </Box>
                    </Box>
                  </Paper>
                </Stack>
              );
            })}
        </Stack>
      </Container>
    </Box>
  );
}
