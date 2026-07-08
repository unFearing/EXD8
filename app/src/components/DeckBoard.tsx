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
  IconButton,
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
  Divider,
} from "@mui/material";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import AddIcon from "@mui/icons-material/Add";
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditIcon from "@mui/icons-material/Edit";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { deleteDropDeck, getDropDecks, getMapConfigs, getMechRoles, getMechs, getQuickslots, saveDropDeck, saveMapConfig, saveQuickslots } from "../api/client";
import { CS26_COMPETITION } from "../constants/competition";
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

type CopiedCell = {
  templateId: string;
  slot: number;
  field: "export" | "skill";
};

type Cs26Issue = {
  kind: "tonnage" | "class-limit" | "duplicate";
  message: string;
};

type Cs26Validation = {
  issues: Cs26Issue[];
  rowIssuesBySlot: Map<number, Cs26Issue[]>;
};

type DeckBoardProps = {
  mode: "light" | "dark";
  onToggleMode: () => void;
  user: DiscordUser | null;
  onLogout: () => void;
  hasRole: (roleId: string) => boolean;
  viewMode: EditMode;
  onViewModeChange: (mode: EditMode) => void;
};

const MAP_FALLBACK_OPTIONS: DeckMap[] = CS26_COMPETITION.majorTabs;
const SIDE_OPTIONS: TeamSide[] = ["1", "2", "either"];
const ROW_COUNT = CS26_COMPETITION.teamSize;
const LANCE_OPTIONS: Lance[] = ["", "A", "B", "C"];
const DECK_AUTOSAVE_DELAY_MS = 1000;
const DECK_POLL_INTERVAL_MS = 5000;
const MIN_FILLED_SLOTS_TO_SAVE = 5;
const TEXT_INPUT_AUTOSAVE_DELAY_MS = 450;
const QUICKSLOT_KEYS: QuickslotKey[] = ["A", "B", "C", "D", "E"];
const MAX_VISIBLE_DECKS_PER_MAP = 3;
const DEFAULT_MAPROOM_URL = "https://maps.mwocomp.com/mwo2?room=IvLEFS2M7dVmsG";
const CS26_MIN_TONNAGE = 300;

const PILOT_OPTIONS = [
  "Extra_Better",
  "Saikyou",
  "GrillSquad",
  "Xiphias",
  "Rabbid0Squirrel",
  "NeirSolon",
  "unFearing",
  "Acerg",
  "Heavenwarrior",
  "Valk1r",
  "CaLL Me GiL",
  "P4TCHY",
  "Bux",
  "HydroKyle240",
  "Itsalrightwithme",
  "ChapDude",
  "Awesomeguyzzz"
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

const DECK_GRID_COLUMNS = "minmax(0, 1.1fr) minmax(0, 1.1fr) minmax(0, 0.55fr) minmax(0, 2fr) minmax(0, 0.7fr) minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1.3fr) minmax(0, 1.2fr)";

function getBuildCodeEntries(buildCodes?: Record<string, string>): Array<{ key: string; code: string; label: string }> {
  if (!buildCodes) return [];
  return Object.entries(buildCodes)
    .filter(([, code]) => typeof code === "string" && code.trim().length > 0)
    .map(([key, code]) => ({ key, code: code.trim(), label: `${key}: ${code.trim()}` }));
}

function getPreferredBuildCode(buildCodes?: Record<string, string>): string {
  const entries = getBuildCodeEntries(buildCodes);
  if (!entries.length) return "";
  const exportEntry = entries.find((entry) => entry.key.toLowerCase() === "export");
  if (exportEntry) return exportEntry.code;
  const defaultEntry = entries.find((entry) => entry.key.toLowerCase() === "default");
  if (defaultEntry) return defaultEntry.code;
  const importedEntry = entries.find((entry) => entry.key.toLowerCase() === "imported");
  if (importedEntry) return importedEntry.code;
  return entries[0]?.code ?? "";
}

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
    buildCode: "",
    skillTree: "",
  };
}

function createTemplate(map: DeckMap, side: TeamSide, version = 1): DeckTemplate {
  return {
    id: crypto.randomUUID(),
    name: `${map} ${sideLabel(side)} v${version}`,
    map,
    side,
    description: "",
    rows: Array.from({ length: ROW_COUNT }, (_, idx) => createEmptyRow(idx + 1)),
  };
}

function escapedRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toTemplateToken(side: TeamSide): string {
  if (side === "1") return "Team 1";
  if (side === "2") return "Team 2";
  return "Either";
}

function toLegacyTemplateToken(side: TeamSide): string {
  if (side === "1") return "1";
  if (side === "2") return "2";
  return "either";
}

function parseAutoTemplateName(name: string, map: DeckMap): { version: number; sideToken: string } | null {
  const matcher = new RegExp(`^${escapedRegex(map)}\\s+(Team 1|Team 2|Either|1|2|either)\\s+v(\\d+)$`, "i");
  const match = name.trim().match(matcher);
  if (!match) return null;
  return { version: Number(match[2]), sideToken: match[1] };
}

function isAutoTemplateName(name: string, map: DeckMap, side: TeamSide): boolean {
  const parsed = parseAutoTemplateName(name, map);
  if (!parsed) return false;
  const normalized = parsed.sideToken.toLowerCase();
  return normalized === toTemplateToken(side).toLowerCase() || normalized === toLegacyTemplateToken(side);
}

function normalizeTemplateName(name: string, map: DeckMap, side: TeamSide): string {
  const parsed = parseAutoTemplateName(name, map);
  if (!parsed) return name;
  return `${map} ${toTemplateToken(side)} v${parsed.version}`;
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
    buildCode: row?.buildCode ?? "",
    skillTree: row?.skillTree ?? "",
  };
}

function toTemplate(doc: DropDeckDoc): DeckTemplate {
  const normalizedSide = doc.side === "Team 1" ? "1" : doc.side === "Team 2" ? "2" : doc.side === "Agnostic" ? "either" : doc.side;
  const rows = Array.from({ length: ROW_COUNT }, (_, idx) => {
    const row = doc.deck.find((entry) => entry.slot === idx + 1);
    return normalizeRow(idx + 1, row);
  });

  return {
    id: doc.id,
    name: normalizeTemplateName(doc.name, doc.map, normalizedSide),
    map: doc.map,
    side: normalizedSide,
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

function resolveMaproomSourceUrl(selectedMapConfig?: MapConfigDoc): string {
  const configWithEmbed = selectedMapConfig as MapConfigDoc & {
    maproomUrl?: string;
    roomUrl?: string;
    iframeUrl?: string;
  };

  return (
    configWithEmbed?.maproomUrl ||
    configWithEmbed?.roomUrl ||
    configWithEmbed?.iframeUrl ||
    DEFAULT_MAPROOM_URL
  );
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
      buildCode: row.buildCode ?? "",
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

export function DeckBoard({ mode, onToggleMode, user, onLogout, hasRole, viewMode, onViewModeChange }: DeckBoardProps) {
  const navigate = useNavigate();
  const isLight = mode === "light";
  const syncedSignaturesRef = useRef<Map<string, string>>(new Map());
  const syncedTemplatesRef = useRef<Map<string, DeckTemplate>>(new Map());

  const editMode = viewMode;
  const [mapConfigs, setMapConfigs] = useState<MapConfigDoc[]>([]);
  const [selectedMap, setSelectedMap] = useState<DeckMap>(MAP_FALLBACK_OPTIONS[0]);
  const [mapTileMode, setMapTileMode] = useState<MapTileMode>("static");
  const [showGridOverlay, setShowGridOverlay] = useState(false);
  const [iframeZoom, setIframeZoom] = useState(1);
  const [iframeOffsetX, setIframeOffsetX] = useState(0);
  const [iframeOffsetY, setIframeOffsetY] = useState(0);
  const [templates, setTemplates] = useState<DeckTemplate[]>([]);
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
  const [mechSelectorSource, setMechSelectorSource] = useState<SelectorSource>("config");
  const [deckRoleOptions, setDeckRoleOptions] = useState<string[]>([]);
  const [maproomUrlInput, setMaproomUrlInput] = useState("");
  const [maproomSaving, setMaproomSaving] = useState(false);
  const [maproomNotice, setMaproomNotice] = useState("");
  const [copiedCell, setCopiedCell] = useState<CopiedCell | null>(null);
  const maproomUrlInputRef = useRef<HTMLInputElement | null>(null);
  const textInputDebounceRef = useRef<Map<string, number>>(new Map());

  void hasRole;
  const canDelete = user?.appRole === "TL";
  const { error } = useMatchNightApi();

  const mapOptions = useMemo<DeckMap[]>(() => {
    if (!mapConfigs.length) return MAP_FALLBACK_OPTIONS;
    return mapConfigs.map((entry) => entry.name);
  }, [mapConfigs]);

  const selectedMapConfig = useMemo(() => mapConfigs.find((entry) => entry.name === selectedMap), [mapConfigs, selectedMap]);
  const hasGridOverlay = Boolean(selectedMapConfig?.gridUrl);
  const maproomEmbedUrl = useMemo(
    () => resolveMaproomEmbedUrl(selectedMap, selectedMapConfig),
    [selectedMap, selectedMapConfig],
  );

  useEffect(() => {
    setMaproomUrlInput(resolveMaproomSourceUrl(selectedMapConfig).trim());
  }, [selectedMapConfig]);

  useEffect(() => {
    if (!maproomNotice) return;
    const timeoutId = window.setTimeout(() => setMaproomNotice(""), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [maproomNotice]);

  useEffect(() => {
    if (!copiedCell) return;
    const timeoutId = window.setTimeout(() => setCopiedCell(null), 1100);
    return () => window.clearTimeout(timeoutId);
  }, [copiedCell]);

  useEffect(() => {
    return () => {
      for (const timeoutId of textInputDebounceRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      textInputDebounceRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (mapTileMode !== "iframe" || editMode !== "edit") return;
    const frame = window.requestAnimationFrame(() => {
      const input = maproomUrlInputRef.current;
      if (!input) return;
      input.focus();
      const length = input.value.length;
      input.setSelectionRange(length, length);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mapTileMode, editMode, selectedMap]);

  useEffect(() => {
    setIframeZoom(1);
    setIframeOffsetX(0);
    setIframeOffsetY(0);
  }, [selectedMap]);

  useEffect(() => {
    if (!hasGridOverlay) setShowGridOverlay(false);
  }, [hasGridOverlay, selectedMap]);

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

    getMechRoles()
      .then((roles) => {
        if (!cancelled) setDeckRoleOptions(roles);
      })
      .catch(() => {
        if (!cancelled) setDeckRoleOptions([]);
      });

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
          setTemplates([]);
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
        setTemplates([]);
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

  const resolveRowConfigMech = (row: DeckRow): ConfigMech | undefined => {
    const rowChassis = (row.chassis ?? "").toLowerCase().trim();
    const rowVariant = (row.variant ?? "").toLowerCase().trim();
    const strippedChassis = rowChassis.replace(/^clan\s+/, "").replace(/^inner sphere\s+/, "");

    return (
      configuredByPair.get(`${rowChassis}|${rowVariant}`) ??
      configuredByPair.get(`${strippedChassis}|${rowVariant}`) ??
      [...configuredByPair.entries()].find(
        ([key]) => key.startsWith(`${strippedChassis}|`) && key.endsWith(rowVariant),
      )?.[1]
    );
  };

  const computeTemplateTonnage = (template?: DeckTemplate) => {
    if (!template) return 0;
    return template.rows.reduce((sum, row) => {
      const byId = mechLookup.get(row.mech)?.tonnage ?? repositoryMechById.get(row.mech)?.tonnage;
      const byConfig = configuredByKey.get(row.mech)?.tonnage;
      const byPair = resolveRowConfigMech(row)?.tonnage;
      return sum + (byId ?? byConfig ?? byPair ?? 0);
    }, 0);
  };

  const countFilledSlots = (template?: DeckTemplate): number => {
    if (!template) return 0;
    return template.rows.reduce((count, row) => {
      const hasMechId = Boolean((row.mech ?? "").trim());
      const hasChassis = Boolean((row.chassis ?? "").trim());
      return count + (hasMechId || hasChassis ? 1 : 0);
    }, 0);
  };

  const validateTemplateCs26 = (template?: DeckTemplate): Cs26Validation => {
    if (!template) return { issues: [], rowIssuesBySlot: new Map<number, Cs26Issue[]>() };

    const issues: Cs26Issue[] = [];
    const rowIssuesBySlot = new Map<number, Cs26Issue[]>();
    const tonnage = computeTemplateTonnage(template);
    if (tonnage < CS26_MIN_TONNAGE) {
      issues.push({
        kind: "tonnage",
        message: `Undertonned: ${tonnage}t (minimum ${CS26_MIN_TONNAGE}t).`,
      });
    }
    if (tonnage > CS26_COMPETITION.rules.maxTonnage) {
      issues.push({
        kind: "tonnage",
        message: `Overtonned: ${tonnage}t (maximum ${CS26_COMPETITION.rules.maxTonnage}t).`,
      });
    }

    const classCounts: Record<WeightClass, number> = { Light: 0, Medium: 0, Heavy: 0, Assault: 0 };
    const chassisCounts = new Map<string, number>();
    const rowFacts: Array<{ slot: number; rowClass?: WeightClass; normalizedChassis: string }> = [];

    for (const row of template.rows) {
      const rowMech = mechLookup.get(row.mech) ?? repositoryMechById.get(row.mech);
      const rowConfig = configuredByKey.get(row.mech) ?? resolveRowConfigMech(row);
      const rowClass = rowMech?.class ?? rowConfig?.class;
      if (rowClass) {
        classCounts[rowClass] += 1;
      }

      const chassis = (row.chassis || rowMech?.chassis || rowConfig?.chassis || "").trim().toLowerCase();
      if (chassis) {
        chassisCounts.set(chassis, (chassisCounts.get(chassis) ?? 0) + 1);
      }

      rowFacts.push({ slot: row.slot, rowClass, normalizedChassis: chassis });
    }

    const overLimitClasses = new Set<WeightClass>();

    for (const [weightClass, count] of Object.entries(classCounts) as Array<[WeightClass, number]>) {
      if (count > CS26_COMPETITION.rules.maxPerClass) {
        overLimitClasses.add(weightClass);
        issues.push({
          kind: "class-limit",
          message: `${weightClass} count ${count} exceeds max ${CS26_COMPETITION.rules.maxPerClass}.`,
        });
      }
    }

    const duplicateChassis = new Set(
      Array.from(chassisCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([chassis]) => chassis),
    );
    if (duplicateChassis.size) {
      issues.push({ kind: "duplicate", message: `Duplicate chassis: ${Array.from(duplicateChassis).join(", ")}.` });
    }

    for (const row of rowFacts) {
      const rowIssues: Cs26Issue[] = [];
      if (row.rowClass && overLimitClasses.has(row.rowClass)) {
        rowIssues.push({ kind: "class-limit", message: `${row.rowClass} is over the class limit.` });
      }
      if (row.normalizedChassis && duplicateChassis.has(row.normalizedChassis)) {
        rowIssues.push({ kind: "duplicate", message: `Duplicate chassis in deck.` });
      }
      if (rowIssues.length) {
        rowIssuesBySlot.set(row.slot, rowIssues);
      }
    }

    return { issues, rowIssuesBySlot };
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

  const scheduleTextInputCommit = (key: string, commit: () => void) => {
    const existing = textInputDebounceRef.current.get(key);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }
    const timeoutId = window.setTimeout(() => {
      textInputDebounceRef.current.delete(key);
      commit();
    }, TEXT_INPUT_AUTOSAVE_DELAY_MS);
    textInputDebounceRef.current.set(key, timeoutId);
  };

  const flushTextInputCommit = (key: string, commit: () => void) => {
    const existing = textInputDebounceRef.current.get(key);
    if (existing !== undefined) {
      window.clearTimeout(existing);
      textInputDebounceRef.current.delete(key);
    }
    commit();
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
    buildCode: getPreferredBuildCode(build.buildCodes),
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
        buildCode: "",
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

  const copyBuildCode = async (value: string, templateId: string, slot: number) => {
    const code = value.trim();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCell({ templateId, slot, field: "export" });
    } catch {
      setDeckError("Failed to copy export code.");
    }
  };

  const copySkillTreeCode = async (value: string, templateId: string, slot: number) => {
    const code = value.trim();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCell({ templateId, slot, field: "skill" });
    } catch {
      setDeckError("Failed to copy skill tree code.");
    }
  };

  const openMechInRepository = (mechId: string | undefined, chassis: string, variant: string) => {
    const params = new URLSearchParams();
    params.set("view", "view");
    if (mechId) {
      params.set("focusMechId", mechId);
    } else {
      if (chassis) params.set("focusChassis", chassis);
      if (variant) params.set("focusVariant", variant);
    }
    const targetUrl = `/repository${params.toString() ? `?${params.toString()}` : ""}`;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
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

    if (countFilledSlots(localTemplate) < MIN_FILLED_SLOTS_TO_SAVE) {
      setDeckError(`Deck must have at least ${MIN_FILLED_SLOTS_TO_SAVE} filled slots before saving.`);
      return undefined;
    }

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
      if (resolvedDeckId) {
        const duplicate = quickslots.some(
          (entry) => entry.map === selectedMap && entry.slot !== slot && entry.deckId === resolvedDeckId,
        );
        if (duplicate) {
          setDeckError("That deck is already assigned to another quickslot for this map.");
          return;
        }
      }
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
    const assignedDeckIds = new Set(
      fixedMapQuickslots.map((entry) => entry.deckId).filter((value): value is string => Boolean(value)),
    );
    const fallbackDeck = templatesForSelection.find((template) => isUuid(template.id) && !assignedDeckIds.has(template.id));
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

  const saveMaproomUrl = async () => {
    const currentConfig = selectedMapConfig;
    if (!currentConfig) {
      setDeckError("Map config unavailable for this map.");
      return;
    }

    try {
      setMaproomSaving(true);
      setDeckError("");
      setMaproomNotice("");
      const saved = await saveMapConfig({
        name: selectedMap,
        imageUrl: currentConfig.imageUrl,
        maproomUrl: maproomUrlInput.trim(),
      });
      setMapConfigs((previous) => previous.map((entry) => (entry.name === saved.name ? { ...entry, ...saved } : entry)));
      setMaproomNotice("Maproom link saved.");
    } catch (err) {
      setDeckError(err instanceof Error ? err.message : "Failed to save maproom URL.");
    } finally {
      setMaproomSaving(false);
    }
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

    if (countFilledSlots(dirtyTemplate) < MIN_FILLED_SLOTS_TO_SAVE) {
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
        <Box sx={{ pl: { xs: 2, md: 6.5 }, pr: { xs: 1.5, md: 2.75 }, py: 1.25, display: "grid", gap: 1.25 }}>
          <Stack direction="row" spacing={2.2} sx={{ alignItems: "center", flexWrap: "nowrap", justifyContent: "space-between" }}>
            <Stack direction="row" spacing={1.6} sx={{ alignItems: "center", flexWrap: "nowrap", minWidth: 0 }}>
              <Typography sx={{ color: isLight ? "#2f3e58" : "#eff5ff", fontWeight: 700, letterSpacing: "0.02em", mr: 0.6 }}>
                EXDEATE
              </Typography>

              <Tabs
                value="dropDecks"
                onChange={(_, value: string) => {
                  if (value === "repository") {
                    navigate("/repository");
                  }
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
              </Tabs>

              <Divider
                orientation="vertical"
                flexItem
                sx={{
                  alignSelf: "stretch",
                  borderColor: isLight ? "rgba(108, 128, 158, 0.3)" : "rgba(130, 154, 217, 0.24)",
                  mx: 1.0,
                }}
              />

              <Tabs
                value={selectedMap}
                onChange={(_, value: DeckMap) => onMapChange(value)}
                variant="standard"
                sx={{
                  minHeight: 38,
                  "& .MuiTab-root": { color: isLight ? "#566987" : "#cbd6f6", minHeight: 38, py: 0, px: 1.6 },
                  "& .Mui-selected": { color: isLight ? "#26364f" : "#ffffff" },
                }}
              >
                {mapOptions.map((map) => (
                  <Tab key={map} label={map} value={map} />
                ))}
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
                  borderRadius: 999,
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

              <ButtonGroup
                size="small"
                sx={{
                  borderRadius: 999,
                  overflow: "hidden",
                  background: isLight ? "rgba(151, 170, 198, 0.1)" : "rgba(121, 149, 206, 0.08)",
                  boxShadow: isLight ? "0 0 0 1px rgba(108, 128, 158, 0.35)" : "0 0 0 1px rgba(130, 154, 217, 0.28)",
                  "& .MuiButton-root": {
                    borderColor: isLight ? "rgba(108, 128, 158, 0.35)" : "rgba(130, 154, 217, 0.32)",
                    minHeight: 38,
                    px: 1.5,
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
                <Button
                  startIcon={<VisibilityIcon fontSize="small" />}
                  variant={editMode === "view" ? "contained" : "outlined"}
                  onClick={() => onViewModeChange("view")}
                >
                  View
                </Button>
                <Button
                  startIcon={<EditIcon fontSize="small" />}
                  variant={editMode === "edit" ? "contained" : "outlined"}
                  onClick={() => onViewModeChange("edit")}
                >
                  Edit
                </Button>
              </ButtonGroup>

              <Button
                variant="contained"
                size="small"
                onClick={onLogout}
                sx={{
                  backgroundColor: "#5865F2",
                  color: "#fff",
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 999,
                  px: 2,
                  minHeight: 38,
                  "&:hover": { backgroundColor: "#4752C4" },
                }}
              >
                Discord Logout
              </Button>
            </Stack>
          </Stack>

        </Box>
      </AppBar>

      <Container maxWidth={false} sx={{ pt: 2, px: { xs: 1, md: 2 } }}>
        <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            {deckError && <Alert severity="error">{deckError}</Alert>}
          {maproomNotice && <Alert severity="success">{maproomNotice}</Alert>}
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
                      <ButtonGroup size="small" variant="outlined">
                        <Button
                          variant={mapTileMode === "static" ? "contained" : "outlined"}
                          onClick={() => setMapTileMode("static")}
                          sx={{ textTransform: "none" }}
                        >
                          Static
                        </Button>
                        <Button
                          variant={showGridOverlay ? "contained" : "outlined"}
                          onClick={() => setShowGridOverlay((prev) => !prev)}
                          disabled={mapTileMode !== "static" || !hasGridOverlay}
                          sx={{ textTransform: "none" }}
                        >
                          {showGridOverlay ? "Grid On" : "Grid Off"}
                        </Button>
                      </ButtonGroup>
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
                            label="Maproom URL"
                            size="small"
                            value={maproomUrlInput}
                            onChange={(event) => setMaproomUrlInput(event.target.value)}
                            disabled={editMode !== "edit"}
                            inputRef={maproomUrlInputRef}
                            sx={{ minWidth: { xs: 260, md: 440 }, flex: 1 }}
                          />
                          {editMode === "edit" && (
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => {
                                void saveMaproomUrl();
                              }}
                              disabled={maproomSaving}
                              sx={{ textTransform: "none" }}
                            >
                              {maproomSaving ? "Saving..." : "Save Link"}
                            </Button>
                          )}
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
                      background: isLight ? "rgba(229, 237, 249, 0.45)" : "rgba(7, 12, 24, 0.52)",
                    }}
                  >
                    {mapTileMode === "static" ? (
                      <>
                        {selectedMapConfig?.imageUrl && (
                          <Box
                            component="img"
                            src={selectedMapConfig.imageUrl}
                            alt={`${selectedMap} map`}
                            sx={{
                              position: "absolute",
                              inset: 0,
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              objectPosition: "center",
                              display: "block",
                              userSelect: "none",
                              pointerEvents: "none",
                            }}
                          />
                        )}
                        {showGridOverlay && selectedMapConfig?.gridUrl && (
                          <Box
                            component="img"
                            src={selectedMapConfig.gridUrl}
                            alt={`${selectedMap} grid overlay`}
                            sx={{
                              position: "absolute",
                              inset: 0,
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              objectPosition: "center",
                              display: "block",
                              opacity: 0.78,
                              userSelect: "none",
                              pointerEvents: "none",
                            }}
                          />
                        )}
                      </>
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
                        {(() => {
                          const safeDeckId =
                            entry.deckId && templatesForSelection.some((template) => template.id === entry.deckId)
                              ? entry.deckId
                              : "";
                          return (
                        <Select
                          label="Deck"
                          value={safeDeckId}
                          onChange={(event) => {
                            const value = String(event.target.value);
                            if (value === "__new__") {
                              const fresh = createTemplate(selectedMap, activeTemplate?.side ?? "either", templatesForSelection.length + 1);
                              setTemplates((previous) => [...previous, fresh]);
                              setSelectedTemplateId(fresh.id);
                              setQuickslotDeck(entry.slot, fresh.id);
                              return;
                            }
                            const alreadyAssigned = fixedMapQuickslots.some((slotEntry) => slotEntry.slot !== entry.slot && slotEntry.deckId === value);
                            if (alreadyAssigned) {
                              setDeckError("That deck is already assigned to another quickslot for this map.");
                              return;
                            }
                            setQuickslotDeck(entry.slot, value || undefined);
                            if (value) setSelectedTemplateId(value);
                          }}
                        >
                          <MenuItem value="">Unassigned</MenuItem>
                          <MenuItem value="__new__">Create fresh deck</MenuItem>
                          {templatesForSelection.map((template) => (
                            <MenuItem
                              key={template.id}
                              value={template.id}
                              disabled={fixedMapQuickslots.some((slotEntry) => slotEntry.slot !== entry.slot && slotEntry.deckId === template.id)}
                            >
                              {template.name}
                            </MenuItem>
                          ))}
                        </Select>
                          );
                        })()}
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
              const cs26Validation = validateTemplateCs26(template);

              return (
                <Stack key={slotEntry.slot} spacing={1.2}>
                  {(() => {
                    const filledSlots = countFilledSlots(template);
                    const readyToAutosave = filledSlots >= MIN_FILLED_SLOTS_TO_SAVE;
                    return (
                      <Typography variant="caption" sx={{ color: readyToAutosave ? (isLight ? "#4f6282" : "#c9d8ff") : (isLight ? "#8a5a00" : "#ffcf76"), px: 0.4 }}>
                        {readyToAutosave
                          ? `Autosave active (${filledSlots}/${ROW_COUNT} slots filled).`
                          : `Autosave pending: fill at least ${MIN_FILLED_SLOTS_TO_SAVE} slots (${filledSlots}/${ROW_COUNT} filled).`}
                      </Typography>
                    );
                  })()}
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
                          defaultValue={template.name ?? ""}
                          disabled={editMode !== "edit"}
                          onChange={(event) => {
                            const nextName = event.target.value;
                            const commitKey = `deck-name-${template.id}`;
                            scheduleTextInputCommit(commitKey, () => {
                              updateTemplateById(template.id, (current) => {
                                if ((current.name ?? "") === nextName) return current;
                                return {
                                  ...current,
                                  name: nextName,
                                };
                              });
                            });
                          }}
                          onBlur={(event) => {
                            const nextName = event.target.value;
                            const commitKey = `deck-name-${template.id}`;
                            flushTextInputCommit(commitKey, () => {
                              updateTemplateById(template.id, (current) => {
                                if ((current.name ?? "") === nextName) return current;
                                return {
                                  ...current,
                                  name: nextName,
                                };
                              });
                            });
                          }}
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
                                name: isAutoTemplateName(current.name, current.map, current.side)
                                  ? `${current.map} ${toTemplateToken(event.target.value as TeamSide)} v${parseAutoTemplateName(current.name, current.map)?.version ?? 1}`
                                  : current.name,
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
                        <FormControl size="small" sx={{ minWidth: 180 }}>
                          <InputLabel>Mech Source</InputLabel>
                          <Select
                            label="Mech Source"
                            value={mechSelectorSource}
                            onChange={(event) => setMechSelectorSource(event.target.value as SelectorSource)}
                          >
                            <MenuItem value="config">Config</MenuItem>
                            <MenuItem value="both">Config + Repository</MenuItem>
                            <MenuItem value="repository">Repository Only</MenuItem>
                          </Select>
                        </FormControl>
                        <Typography sx={{ color: isLight ? "#556887" : "#bfd0ff", fontWeight: 700 }}>
                          Total Tonnage: {computeTemplateTonnage(template)} t
                        </Typography>
                        {(() => {
                          if (!cs26Validation.issues.length) return null;
                          return (
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { xs: "flex-start", sm: "center" } }}>
                              <Stack direction="row" spacing={0.4} sx={{ alignItems: "center" }}>
                                <WarningAmberIcon fontSize="small" sx={{ color: "#f59e0b" }} />
                                <Typography variant="caption" sx={{ color: isLight ? "#8a5a00" : "#ffcf76", fontWeight: 700 }}>
                                  CS26 Issues
                                </Typography>
                              </Stack>
                              <Stack spacing={0.35} sx={{ minWidth: 280 }}>
                                {cs26Validation.issues.map((issue, idx) => (
                                  <Typography
                                    key={`${issue.kind}-${idx}`}
                                    variant="caption"
                                    sx={{ color: isLight ? "#8a5a00" : "#ffcf76", fontWeight: 600, lineHeight: 1.35 }}
                                  >
                                    {issue.message}
                                  </Typography>
                                ))}
                              </Stack>
                            </Stack>
                          );
                        })()}
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

                    <Box sx={{ p: 1.5, overflowX: "hidden", width: "100%" }}>
                      <Box sx={{ width: "100%" }}>
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: DECK_GRID_COLUMNS,
                            gap: 1,
                            px: 1,
                            pb: 0.8,
                            borderBottom: isLight ? "1px solid rgba(122, 143, 174, 0.25)" : "1px solid rgba(120, 146, 210, 0.2)",
                          }}
                        >
                          {["Primary", "Alternates", "Lance", "Mech", "Class", "Tonnage", "Role", "Build", "Export Code", "Skill Tree"].map((header) => (
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
                            const configMech = mechDetails.configMech;
                            const rowChassis = row.chassis || mech?.chassis || "";
                            const rowVariant = row.variant || mech?.variant || "";
                            const normalizedChassis = rowChassis.toLowerCase().replace(/^clan\s+/, "").replace(/^inner sphere\s+/, "").trim();
                            const normalizedVariant = rowVariant.toLowerCase().trim();
                            const selectedConfigMech =
                              configuredByPair.get(`${rowChassis.toLowerCase()}|${normalizedVariant}`) ??
                              configuredByPair.get(`${normalizedChassis}|${normalizedVariant}`) ??
                              [...configuredByPair.entries()].find(
                                ([key]) => key.startsWith(`${normalizedChassis}|`) && key.endsWith(normalizedVariant),
                              )?.[1];
                            const buildOptions = getBuildOptions(rowChassis, rowVariant);
                            const selectedBuildId = mech?.id || row.mech || "";
                            const hasSelectedRepositoryBuild = Boolean(mech && row.mech && mech.id === row.mech);
                            const rowClass = mech?.class ?? configMech?.class ?? selectedConfigMech?.class ?? "-";
                            const rowTonnage = mech?.tonnage ?? configMech?.tonnage ?? selectedConfigMech?.tonnage;
                            const rowIssues = cs26Validation.rowIssuesBySlot.get(row.slot) ?? [];

                            return (
                              <Box
                                key={row.slot}
                                sx={{
                                  display: "grid",
                                  gridTemplateColumns: DECK_GRID_COLUMNS,
                                  gap: 1,
                                  alignItems: "center",
                                  px: 1,
                                  py: 0.7,
                                  borderRadius: 1.2,
                                  border: rowIssues.length
                                    ? isLight
                                      ? "1px solid rgba(202, 145, 49, 0.5)"
                                      : "1px solid rgba(255, 189, 71, 0.45)"
                                    : isLight
                                      ? "1px solid rgba(122, 143, 174, 0.22)"
                                      : "1px solid rgba(120, 146, 210, 0.22)",
                                  background: rowIssues.length
                                    ? isLight
                                      ? "rgba(255, 196, 87, 0.09)"
                                      : "rgba(255, 183, 77, 0.08)"
                                    : isLight
                                      ? "rgba(226, 234, 244, 0.34)"
                                      : "rgba(18, 27, 54, 0.36)",
                                }}
                              >
                                <FormControl size="small" fullWidth variant="standard">
                                  <Select
                                    multiple
                                    variant="standard"
                                    value={row.primary}
                                    displayEmpty
                                    MenuProps={{
                                      slotProps: {
                                        paper: {
                                          sx: {
                                            maxHeight: 420,
                                            "& .MuiMenuItem-root": {
                                              minHeight: 34,
                                              py: 0.2,
                                            },
                                          },
                                        },
                                      },
                                    }}
                                    disabled={editMode !== "edit"}
                                    onChange={(event) => setPrimaryPilots(template.id, rowIndex, event.target.value as string[])}
                                    renderValue={(value) => formatPilotDisplay((value as string[]) || []) || "-"}
                                    sx={editMode === "edit" ? editSelectIconSx : { "& .MuiSelect-icon": { display: "none" } }}
                                  >
                                    {PILOT_OPTIONS.map((pilot) => (
                                      <MenuItem key={pilot} value={pilot} dense>
                                        <Checkbox checked={row.primary.includes(pilot)} size="small" sx={{ mr: 0.6, py: 0.2 }} />
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
                                    MenuProps={{
                                      slotProps: {
                                        paper: {
                                          sx: {
                                            maxHeight: 420,
                                            "& .MuiMenuItem-root": {
                                              minHeight: 34,
                                              py: 0.2,
                                            },
                                          },
                                        },
                                      },
                                    }}
                                    disabled={editMode !== "edit"}
                                    onChange={(event) => setAlternatePilots(template.id, rowIndex, event.target.value as string[])}
                                    renderValue={(value) => formatPilotDisplay((value as string[]) || []) || "-"}
                                    sx={editMode === "edit" ? editSelectIconSx : { "& .MuiSelect-icon": { display: "none" } }}
                                  >
                                    {PILOT_OPTIONS.map((pilot) => (
                                      <MenuItem key={pilot} value={pilot} dense>
                                        <Checkbox checked={getVisibleAlternates(row).includes(pilot)} size="small" sx={{ mr: 0.6, py: 0.2 }} />
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

                                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
                                  {rowIssues.length ? <WarningAmberIcon fontSize="inherit" sx={{ color: "#f59e0b", fontSize: "0.95rem", flexShrink: 0 }} /> : null}
                                  <Box sx={{ minWidth: 0, flex: 1 }}>
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
                                  </Box>
                                </Stack>

                                <Typography variant="body2" sx={{ color: isLight ? "#4f6282" : "#d3ddfc", fontSize: "0.85rem" }}>
                                  {rowClass}
                                </Typography>

                                <Typography variant="body2" sx={{ color: isLight ? "#4f6282" : "#d3ddfc", fontSize: "0.85rem" }}>
                                  {typeof rowTonnage === "number" ? `${rowTonnage} t` : "-"}
                                </Typography>

                                <FormControl size="small" fullWidth variant="standard">
                                  <Select
                                    variant="standard"
                                    value={row.role ?? ""}
                                    displayEmpty
                                    disabled={editMode !== "edit"}
                                    onChange={(event) => updateRow(template.id, rowIndex, (entry) => ({ ...entry, role: event.target.value }))}
                                    renderValue={(value) => value || mech?.role || "-"}
                                    sx={editMode === "edit" ? editSelectIconSx : { "& .MuiSelect-icon": { display: "none" } }}
                                  >
                                    <MenuItem value="">{mech?.role || "- (none)"}</MenuItem>
                                    {deckRoleOptions.map((role) => (
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

                                {(() => {
                                  const selectedCode = row.buildCode && row.buildCode.trim().length > 0
                                    ? row.buildCode.trim()
                                    : getPreferredBuildCode(mech?.buildCodes);

                                  if (!selectedCode) {
                                    return (
                                      <Typography
                                        variant="body2"
                                        sx={{ color: isLight ? "#4f6282" : "#d3ddfc", fontSize: "0.8rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                                      >
                                        -
                                      </Typography>
                                    );
                                  }

                                  return (
                                    <Stack direction="row" spacing={0.2} sx={{ alignItems: "center", minWidth: 0 }}>
                                      <Typography
                                        variant="body2"
                                        onClick={() => {
                                          void copyBuildCode(selectedCode, template.id, row.slot);
                                        }}
                                        title="Click to copy"
                                        sx={{
                                          color: isLight ? "#3a6fbd" : "#7fb3ff",
                                          fontSize: "0.8rem",
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          cursor: "pointer",
                                          minWidth: 0,
                                          flex: 1,
                                        }}
                                      >
                                        {selectedCode}
                                      </Typography>
                                      {copiedCell?.templateId === template.id && copiedCell.slot === row.slot && copiedCell.field === "export" && (
                                        <Typography
                                          variant="caption"
                                          sx={{
                                            px: 0.6,
                                            py: 0.15,
                                            borderRadius: 0.8,
                                            background: isLight ? "rgba(58, 111, 189, 0.14)" : "rgba(127, 179, 255, 0.2)",
                                            color: isLight ? "#2f5d99" : "#b7d4ff",
                                            fontWeight: 700,
                                            flexShrink: 0,
                                          }}
                                        >
                                          Copied
                                        </Typography>
                                      )}
                                      <Tooltip title="Copy export code">
                                        <IconButton
                                          size="small"
                                          onClick={() => {
                                            void copyBuildCode(selectedCode, template.id, row.slot);
                                          }}
                                          sx={{ color: isLight ? "#3a6fbd" : "#7fb3ff", flexShrink: 0 }}
                                        >
                                          <ContentCopyIcon fontSize="inherit" />
                                        </IconButton>
                                      </Tooltip>
                                    </Stack>
                                  );
                                })()}

                                {editMode === "edit" ? (
                                  <Stack direction="row" spacing={0.3} sx={{ alignItems: "center", minWidth: 0 }}>
                                    <TextField
                                      variant="standard"
                                      fullWidth
                                      defaultValue={row.skillTree ?? ""}
                                      onChange={(event) => {
                                        const nextSkillTree = event.target.value;
                                        const commitKey = `skill-tree-${template.id}-${row.slot}`;
                                        scheduleTextInputCommit(commitKey, () => {
                                          updateRow(template.id, rowIndex, (entry) => {
                                            if ((entry.skillTree ?? "") === nextSkillTree) return entry;
                                            return { ...entry, skillTree: nextSkillTree };
                                          });
                                        });
                                      }}
                                      onBlur={(event) => {
                                        const nextSkillTree = event.target.value;
                                        const commitKey = `skill-tree-${template.id}-${row.slot}`;
                                        flushTextInputCommit(commitKey, () => {
                                          updateRow(template.id, rowIndex, (entry) => {
                                            if ((entry.skillTree ?? "") === nextSkillTree) return entry;
                                            return { ...entry, skillTree: nextSkillTree };
                                          });
                                        });
                                      }}
                                    />
                                    {(() => {
                                      const skillTreeCode = (row.skillTree || mech?.skillCode || "").trim();
                                      const copyable = Boolean(skillTreeCode) && skillTreeCode !== "-" && skillTreeCode.toLowerCase() !== "pending";
                                      if (!copyable) return null;
                                      return (
                                        <>
                                          {copiedCell?.templateId === template.id && copiedCell.slot === row.slot && copiedCell.field === "skill" && (
                                            <Typography
                                              variant="caption"
                                              sx={{
                                                px: 0.6,
                                                py: 0.15,
                                                borderRadius: 0.8,
                                                background: isLight ? "rgba(58, 111, 189, 0.14)" : "rgba(127, 179, 255, 0.2)",
                                                color: isLight ? "#2f5d99" : "#b7d4ff",
                                                fontWeight: 700,
                                                flexShrink: 0,
                                              }}
                                            >
                                              Copied
                                            </Typography>
                                          )}
                                          <Tooltip title="Copy skill tree code">
                                            <IconButton
                                              size="small"
                                              onClick={() => {
                                                void copySkillTreeCode(skillTreeCode, template.id, row.slot);
                                              }}
                                              sx={{ color: isLight ? "#3a6fbd" : "#7fb3ff", flexShrink: 0 }}
                                            >
                                              <ContentCopyIcon fontSize="inherit" />
                                            </IconButton>
                                          </Tooltip>
                                        </>
                                      );
                                    })()}
                                    {hasSelectedRepositoryBuild && (
                                      <Tooltip title="Open this mech in Repository">
                                        <IconButton
                                          size="small"
                                          onClick={() => openMechInRepository(mech?.id, rowChassis, rowVariant)}
                                          sx={{ color: isLight ? "#3a6fbd" : "#7fb3ff", flexShrink: 0 }}
                                        >
                                          <OpenInNewIcon fontSize="inherit" />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                  </Stack>
                                ) : (
                                  <Stack direction="row" spacing={0.3} sx={{ alignItems: "center", minWidth: 0 }}>
                                    {(() => {
                                      const skillTreeCode = (row.skillTree || mech?.skillCode || "").trim();
                                      const display = skillTreeCode || "-";
                                      const copyable = Boolean(skillTreeCode) && skillTreeCode !== "-" && skillTreeCode.toLowerCase() !== "pending";
                                      return (
                                        <>
                                          {copyable && (
                                            <>
                                              {copiedCell?.templateId === template.id && copiedCell.slot === row.slot && copiedCell.field === "skill" && (
                                                <Typography
                                                  variant="caption"
                                                  sx={{
                                                    px: 0.6,
                                                    py: 0.15,
                                                    borderRadius: 0.8,
                                                    background: isLight ? "rgba(58, 111, 189, 0.14)" : "rgba(127, 179, 255, 0.2)",
                                                    color: isLight ? "#2f5d99" : "#b7d4ff",
                                                    fontWeight: 700,
                                                    flexShrink: 0,
                                                  }}
                                                >
                                                  Copied
                                                </Typography>
                                              )}
                                              <Tooltip title="Copy skill tree code">
                                                <IconButton
                                                  size="small"
                                                  onClick={() => {
                                                    void copySkillTreeCode(skillTreeCode, template.id, row.slot);
                                                  }}
                                                  sx={{ color: isLight ? "#3a6fbd" : "#7fb3ff", flexShrink: 0 }}
                                                >
                                                  <ContentCopyIcon fontSize="inherit" />
                                                </IconButton>
                                              </Tooltip>
                                            </>
                                          )}
                                          <Typography
                                            variant="body2"
                                            onClick={() => {
                                              if (!copyable) return;
                                              void copySkillTreeCode(skillTreeCode, template.id, row.slot);
                                            }}
                                            sx={{
                                              color: copyable ? (isLight ? "#3a6fbd" : "#7fb3ff") : (isLight ? "#4f6282" : "#d3ddfc"),
                                              fontSize: "0.85rem",
                                              whiteSpace: "nowrap",
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              minWidth: 0,
                                              flex: 1,
                                              cursor: copyable ? "pointer" : "default",
                                            }}
                                            title={copyable ? "Click to copy" : display}
                                          >
                                            {display}
                                          </Typography>
                                        </>
                                      );
                                    })()}
                                    {hasSelectedRepositoryBuild && (
                                      <Tooltip title="Open this mech in Repository">
                                        <IconButton
                                          size="small"
                                          onClick={() => openMechInRepository(mech?.id, rowChassis, rowVariant)}
                                          sx={{ color: isLight ? "#3a6fbd" : "#7fb3ff", flexShrink: 0 }}
                                        >
                                          <OpenInNewIcon fontSize="inherit" />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                  </Stack>
                                )}
                              </Box>
                            );
                          })}
                        </Stack>
                      </Box>
                    </Box>
                  </Paper>

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
                      defaultValue={template.description ?? ""}
                      disabled={editMode !== "edit"}
                      sx={{ mt: 1 }}
                      onChange={(event) => {
                        const nextDescription = event.target.value;
                        const commitKey = `deck-description-${template.id}`;
                        scheduleTextInputCommit(commitKey, () => {
                          updateTemplateById(template.id, (current) => {
                            if ((current.description ?? "") === nextDescription) return current;
                            return { ...current, description: nextDescription };
                          });
                        });
                      }}
                      onBlur={(event) => {
                        const nextDescription = event.target.value;
                        const commitKey = `deck-description-${template.id}`;
                        flushTextInputCommit(commitKey, () => {
                          updateTemplateById(template.id, (current) => {
                            if ((current.description ?? "") === nextDescription) return current;
                            return { ...current, description: nextDescription };
                          });
                        });
                      }}
                    />
                  </Paper>
                </Stack>
              );
            })}
        </Stack>
      </Container>
    </Box>
  );
}
