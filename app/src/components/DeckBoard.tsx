import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  AppBar,
  Box,
  Button,
  ButtonGroup,
  Checkbox,
  CircularProgress,
  Autocomplete,
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
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ParkIcon from "@mui/icons-material/Park";
import BackspaceIcon from "@mui/icons-material/Backspace";
import StarIcon from "@mui/icons-material/Star";
import mechWarrior3Cutout from "../assets/mw3-mech-cutout.png";
import { deleteDropDeck, getDropDecks, getMapConfigs, getMechRoles, getMechs, getQuickslots, parseMechBuild, saveDropDeck, saveMapConfig, saveQuickslots } from "../api/client";
import { CS26_COMPETITION } from "../constants/competition";
import { useMatchNightApi } from "../hooks/useMatchNightApi";
import { MechSelector } from "./MechSelector";
import type { DiscordUser } from "../hooks/useDiscordAuth";
import type { PresenceDoc } from "../types/contracts";
import { PresenceWidget } from "./PresenceWidget";
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
  WeightClass,
} from "../types/contracts";
import { resolveAppRole } from "../utils/discordRoles";
import { LIGHT_VIEW_APP_BAR, LIGHT_VIEW_BACKGROUND, LIGHT_VIEW_PANEL } from "../constants/viewPalette";
import { getMechSkillTreeCode } from "../utils/skillTree";

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
  initial: string;
  ideal: string;
  revision?: number;
  updatedAt?: string;
  updatedBy?: string;
  rows: DeckRow[];
};

type CopiedCell = {
  templateId: string;
  slot: number;
  field: "export" | "skill";
};

type BuildOption = {
  label: string;
  code: string;
  skillTreeCode: string;
  mechId: string;
  mechLabel: string;
  submittedAt?: string;
  suggestedBuild?: boolean;
};

function StrategyTextField({
  value,
  label,
  disabled,
  onCommit,
}: {
  value: string;
  label: string;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const focusedRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    if (focusedRef.current || timerRef.current !== null || value === draftRef.current) return;
    draftRef.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const commitDraft = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (draftRef.current !== value) {
      onCommitRef.current(draftRef.current);
    }
  };

  return (
    <TextField
      variant="outlined"
      fullWidth
      multiline
      minRows={4}
      value={draft}
      disabled={disabled}
      slotProps={{ htmlInput: { "aria-label": label } }}
      sx={{ mt: 0.6 }}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        draftRef.current = nextValue;
        setDraft(nextValue);
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          if (draftRef.current !== value) {
            onCommitRef.current(draftRef.current);
          }
        }, TEXT_INPUT_AUTOSAVE_DELAY_MS);
      }}
      onBlur={() => {
        focusedRef.current = false;
        commitDraft();
      }}
    />
  );
}

function HoverRevealCodeField({
  value,
  label,
  disabled,
  onChange,
  onBlur,
}: {
  value: string;
  label: string;
  disabled: boolean;
  onChange: (nextValue: string) => void;
  onBlur: (nextValue: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const startReveal = () => {
    if (disabled) return;
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    hoverTimerRef.current = window.setTimeout(() => {
      setRevealed(true);
    }, 3000);
  };

  const clearReveal = () => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setRevealed(false);
  };

  const maskedValue = value.trim();
  const displayValue = revealed ? value : maskedValue ? `${maskedValue.slice(0, 3)}${maskedValue.length > 3 ? "…" : ""}` : "";

  const handleCopy = async () => {
    if (!value || revealed || disabled) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch {
      // no-op so editing remains usable without breaking the UI
    }
  };

  return (
    <Box
      sx={{ minWidth: 0, width: "100%" }}
      onMouseEnter={startReveal}
      onMouseLeave={clearReveal}
      onFocus={startReveal}
      onBlur={clearReveal}
    >
      <TextField
        variant="standard"
        fullWidth
        value={displayValue}
        disabled={disabled}
        onClick={() => {
          if (!revealed) {
            void handleCopy();
          }
        }}
        onFocus={() => setRevealed(true)}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => {
          clearReveal();
          onBlur(event.target.value);
        }}
        slotProps={{
          htmlInput: {
            "aria-label": label,
            title: copied ? "Copied" : value ? "Click to copy" : "",
            onDoubleClick: (event: { currentTarget: HTMLInputElement }) => {
              const target = event.currentTarget;
              target.select();
              setRevealed(true);
            },
            style: {
              width: revealed ? "100%" : "3ch",
              minWidth: 0,
              padding: "2px 0",
              fontSize: "0.74rem",
              fontFamily: "monospace",
              letterSpacing: revealed ? "0.08em" : "0.16em",
              color: revealed ? "#edf5ff" : "rgba(219, 234, 254, 0.8)",
              textShadow: revealed ? "0 0 12px rgba(99, 102, 241, 0.9)" : "none",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: value ? 1 : 0.6,
              transition: "text-shadow 140ms ease, opacity 140ms ease, width 140ms ease",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            },
          },
        }}
        sx={{
          minWidth: 0,
          "& .MuiInputBase-root": {
            minWidth: 0,
            width: "100%",
            alignItems: "center",
            color: revealed ? "#edf5ff" : "rgba(219, 234, 254, 0.8)",
          },
          "& .MuiInputBase-input": {
            px: 0,
            fontSize: "0.74rem",
            letterSpacing: revealed ? "0.08em" : "0.16em",
            fontFamily: "monospace",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          },
          "& .MuiInput-underline:before": {
            borderBottomColor: revealed ? "rgba(255,255,255,0.22)" : "rgba(148, 163, 184, 0.18)",
          },
          "& .MuiInput-underline:after": {
            borderBottomColor: revealed ? "rgba(96, 165, 250, 0.9)" : "rgba(148, 163, 184, 0.28)",
          },
        }}
      />
    </Box>
  );
}

function formatSubmissionDate(value?: string, cosmosTimestamp?: number): string {
  const submittedAt = value ?? (cosmosTimestamp ? new Date(cosmosTimestamp * 1000).toISOString() : "");
  if (!submittedAt) return "Submission date unavailable";

  const date = new Date(submittedAt);
  if (Number.isNaN(date.getTime())) return "Submission date unavailable";
  return `Submitted ${date.toLocaleDateString()}`;
}

function BuildAutocompleteField({
  value,
  options,
  onCommit,
  onSelect,
  parsing,
  onParseUrl,
}: {
  value: string;
  options: BuildOption[];
  onCommit: (value: string) => void;
  onSelect?: (option: BuildOption | null) => void;
  parsing: boolean;
  onParseUrl: (url: string) => Promise<string | undefined>;
}) {
  const [localValue, setLocalValue] = useState(value);
  const focusedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!focusedRef.current && value !== localValue) {
      setLocalValue(value);
    }
  }, [localValue, value]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (localValue === value) return;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onCommit(localValue);
    }, TEXT_INPUT_AUTOSAVE_DELAY_MS);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [localValue, onCommit, value]);

  const parseUrl = async (url: string) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const parsedValue = await onParseUrl(url);
    if (parsedValue !== undefined) {
      setLocalValue(parsedValue);
    }
  };

  return (
    <Autocomplete
      freeSolo
      forcePopupIcon
      options={options}
      getOptionKey={(option) => (typeof option === "string" ? option : option.mechId)}
      inputValue={localValue}
      openOnFocus
      filterOptions={(opts) => {
        // Always show all options; let user filter by typing
        return opts;
      }}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        if (localValue !== value) {
          onCommit(localValue);
        }
      }}
      onInputChange={(_, nextValue) => {
        setLocalValue(nextValue);
      }}
      onChange={(_, nextValue) => {
        if (typeof nextValue === "string") {
          const nextText = nextValue.trim();
          setLocalValue(nextText);
          onCommit(nextText);
          onSelect?.(options.find((option) => option.label === nextText || option.code === nextText) ?? null);
          return;
        }

        if (!nextValue) {
          setLocalValue("");
          onCommit("");
          onSelect?.(null);
          return;
        }

        setLocalValue(nextValue.label);
        onCommit(nextValue.label);
        onSelect?.(nextValue);
      }}
      getOptionLabel={(option) => (typeof option === "string" ? option : option.label)}
      renderOption={(props, option) => (
        <li {...props}>
          <Stack spacing={0.1} sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              {option.suggestedBuild && <StarIcon aria-label="Suggested build" sx={{ color: "#d69b13", fontSize: "0.95rem", flexShrink: 0 }} />}
              <Typography variant="body2" sx={{ lineHeight: 1.1 }}>
                {option.mechLabel} | {option.label}
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ opacity: 0.72, lineHeight: 1.1 }}>
              {option.submittedAt}
            </Typography>
          </Stack>
        </li>
      )}
      renderInput={(params) => (
        <Box sx={{ position: "relative", minWidth: 0 }}>
          <TextField
            {...params}
            variant="standard"
            placeholder={parsing ? "Parsing..." : "Build"}
            disabled={parsing}
            fullWidth
            onPaste={(event) => {
              const text = event.clipboardData.getData("text").trim();
              if (!isAbsoluteHttpUrl(text)) return;
              event.preventDefault();
              void parseUrl(text);
            }}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              const text = (event.dataTransfer.getData("text") || event.dataTransfer.getData("text/uri-list")).trim();
              if (!isAbsoluteHttpUrl(text)) return;
              event.preventDefault();
              void parseUrl(text);
            }}
            sx={{ minWidth: 0 }}
          />
          {parsing ? (
            <CircularProgress
              size={14}
              aria-label="Parsing build link"
              sx={{ position: "absolute", right: 4, top: "50%", mt: "-7px" }}
            />
          ) : null}
        </Box>
      )}
      sx={{ minWidth: 0 }}
    />
  );
}

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
  presence: PresenceDoc[];
};

const MAP_FALLBACK_OPTIONS: DeckMap[] = CS26_COMPETITION.majorTabs;
const SIDE_OPTIONS: TeamSide[] = ["1", "2", "either"];
const ROW_COUNT = CS26_COMPETITION.teamSize;
const LANCE_OPTIONS: Lance[] = ["", "A", "B", "C"];
const DECK_AUTOSAVE_DELAY_MS = 1000;
const DECK_POLL_INTERVAL_MS = 10000;
const MIN_FILLED_SLOTS_TO_SAVE = 5;
const TEXT_INPUT_AUTOSAVE_DELAY_MS = 450;
const QUICKSLOT_KEYS: QuickslotKey[] = ["A", "B", "C", "D", "E"];
const DEFAULT_MAPROOM_URL = "https://maps.mwocomp.com/mwo2?room=IvLEFS2M7dVmsG";
const CS26_MIN_TONNAGE = 300;
const LIVE_EDITOR_WINDOW_MS = 60000;
const TABLE_HEADERS = ["Primary", "Alternates", "Lance", "Mech", "Class", "Tonnage", "Role", "Build", "Code", "Skill", "Repo", ""];

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
  "maddy",
  "Itsy",
  "Acerg",
  "GiL",
  "Chap",
  "Hydro",
  "Awes"
];

const formatPilotDisplay = (pilots: string[]): string => {
  if (!pilots.length) return "";
  return pilots.join(", ");
};

const editSelectIconSx = {
  "& .MuiSelect-icon": { opacity: 0, transition: "opacity 140ms ease" },
  "&:hover .MuiSelect-icon": { opacity: 0.5 },
  "&.Mui-focused .MuiSelect-icon": { opacity: 0.5 },
};

const DECK_GRID_COLUMNS = "minmax(0, 1.1fr) minmax(0, 1.1fr) 36px minmax(0, 2fr) minmax(0, 0.7fr) 54px minmax(0, 1fr) minmax(0, 2fr) 32px 32px 32px 32px";

const getAvailableCode = (value: string | undefined): string => {
  const code = value?.trim() ?? "";
  return code && code !== "-" && code.toLowerCase() !== "pending" ? code : "";
};

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

type WeightClassLabel = "Light" | "Medium" | "Heavy" | "Assault";

const WEIGHT_CLASS_GRADIENTS: Record<WeightClassLabel, {
  lightGradient: string;
  darkGradient: string;
  lightFallback: string;
  darkFallback: string;
}> = {
  Light: {
    lightGradient: "linear-gradient(120deg, #1b56c7 0%, #2f8ff0 100%)",
    darkGradient: "linear-gradient(120deg, #5a9af0 0%, #85bcff 100%)",
    lightFallback: "#1f52ad",
    darkFallback: "#89bcff",
  },
  Medium: {
    lightGradient: "linear-gradient(120deg, #8f8a7a 0%, #c3ad91 100%)",
    darkGradient: "linear-gradient(120deg, #9da8a6 0%, #c8b79f 100%)",
    lightFallback: "#7d7666",
    darkFallback: "#c8bead",
  },
  Heavy: {
    lightGradient: "linear-gradient(120deg, #c97428 0%, #e39a4a 100%)",
    darkGradient: "linear-gradient(120deg, #e3a261 0%, #f0bf87 100%)",
    lightFallback: "#a76524",
    darkFallback: "#efbf8f",
  },
  Assault: {
    lightGradient: "linear-gradient(120deg, #bc3f3f 0%, #da5c5c 100%)",
    darkGradient: "linear-gradient(120deg, #d97272 0%, #e89a9a 100%)",
    lightFallback: "#9c3535",
    darkFallback: "#e8a2a2",
  },
};

function asWeightClassLabel(value: string): WeightClassLabel | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "light") return "Light";
  if (normalized === "medium") return "Medium";
  if (normalized === "heavy") return "Heavy";
  if (normalized === "assault") return "Assault";
  return null;
}

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
    initial: "",
    ideal: "",
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

function getDuplicateTemplateName(name: string, templates: DeckTemplate[]): string {
  const existing = new Set(templates.map((template) => template.name.trim().toLowerCase()));
  const base = `${name} (Copy)`;
  if (!existing.has(base.trim().toLowerCase())) {
    return base;
  }

  let counter = 2;
  while (counter < 1000) {
    const candidate = `${name} (Copy ${counter})`;
    if (!existing.has(candidate.trim().toLowerCase())) {
      return candidate;
    }
    counter += 1;
  }

  return `${name} (Copy ${Date.now()})`;
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
    buildUrl: row?.buildUrl ?? "",
    role: row?.role ?? "",
    buildCode: row?.buildCode ?? "",
    skillTree: row?.skillTree ?? "",
    tonnage: row?.tonnage ?? "",
  };
}

function normalizeChassisToken(value: string): string {
  return value.toLowerCase().replace(/^clan\s+/, "").replace(/^inner sphere\s+/, "").trim();
}

function normalizeVariantToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

const CONFIG_VARIANT_ALIASES: Record<string, string[]> = {
  "flea|romeo5000": ["r5k", "fler5k"],
  "longbow|overcharge": ["oc", "lgboc"],
};

function getGeneratedConfigVariantAliases(mech: ConfigMech): string[] {
  const aliases = new Set<string>();
  const variant = mech.variant.trim();
  if (!variant || /^[a-z0-9]+(?:-[a-z0-9()]+)+$/i.test(variant)) return [];

  const words = (variant.match(/[a-z0-9]+/gi) ?? []).map((word) => word.toLowerCase());
  const filteredWords = words.filter((word) => !["the", "a", "an", "of", "and", "st", "saint"].includes(word));

  const candidateInitialisms = [
    words.map((word) => word[0]).join(""),
    filteredWords.map((word) => word[0]).join(""),
  ];

  for (const initialism of candidateInitialisms) {
    if (!initialism) continue;
    aliases.add(initialism);
    if (mech.chassisCode) {
      aliases.add(`${mech.chassisCode}${initialism}`);
    }
  }

  const normalized = normalizeVariantToken(variant);
  if (normalized) aliases.add(normalized);

  return Array.from(aliases);
}

function getConfigPairLookupKeys(mech: ConfigMech): string[] {
  const canonicalKey = getPairLookupKey(mech.chassis, mech.variant);
  const aliases = new Set(CONFIG_VARIANT_ALIASES[canonicalKey] ?? []);
  for (const alias of getGeneratedConfigVariantAliases(mech)) {
    aliases.add(alias);
  }

  return [canonicalKey, ...Array.from(aliases, (alias) => getPairLookupKey(mech.chassis, alias))];
}

function inferConfigChassisCode(chassis: MechsConfigFile["mechs"]["IS"]["LIGHT"][string]): string {
  if (chassis.chassis_code.trim()) return chassis.chassis_code.trim();

  const counts = new Map<string, number>();
  for (const variant of chassis.variants) {
    const prefix = variant.match(/^([a-z0-9]+)-/i)?.[1]?.toUpperCase();
    if (prefix) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "";
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
    initial: doc.initial ?? "",
    ideal: doc.ideal ?? "",
    revision: doc.revision,
    updatedAt: doc.updatedAt,
    updatedBy: doc.updatedBy,
    rows,
  };
}

function sideLabel(side: TeamSide): string {
  if (side === "1") return "Team 1";
  if (side === "2") return "Team 2";
  return "Either";
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
        const chassisCode = inferConfigChassisCode(chassis);
        for (const variant of chassis.variants) {
          list.push({
            key: `${chassis.chassis_name}|${variant}`,
            tech,
            class: toWeightClassLabel(classKey),
            chassis: chassis.chassis_name,
            chassisCode,
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
  try {
    const response = await fetch("/mechs_config.json");
    if (!response.ok) return [];
    const parsed = (await response.json()) as MechsConfigFile;
    if (!parsed?.mechs) return [];
    return flattenMechsConfig(parsed);
  } catch {
    return [];
  }
}

function formatUpdatedAt(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function isLikelyDiscordSnowflake(value: string): boolean {
  return /^\d{12,20}$/.test(value.trim());
}

function getPairLookupKey(chassis: string, variant: string): string {
  return `${normalizeChassisToken(chassis)}|${normalizeVariantToken(variant)}`;
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
    initial: template.initial,
    ideal: template.ideal,
    rows: template.rows,
  });
}

function mergeSavedTemplate(current: DeckTemplate, submitted: DeckTemplate, saved: DeckTemplate): DeckTemplate {
  if (templateSignature(current) === templateSignature(submitted)) return saved;

  return {
    ...current,
    id: saved.id,
    revision: saved.revision,
    updatedAt: saved.updatedAt,
    updatedBy: saved.updatedBy,
  };
}

function toDropDeckEditable(template: DeckTemplate): DropDeckEditable {
  return {
    map: template.map,
    side: template.side,
    description: template.description,
    initial: template.initial,
    ideal: template.ideal,
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
      buildUrl: row.buildUrl,
      role: row.role ?? "",
      buildCode: row.buildCode ?? "",
      skillTree: row.skillTree ?? "",
      tonnage: row.tonnage ?? "",
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

export function DeckBoard({ mode, onToggleMode, user, onLogout, hasRole, viewMode, onViewModeChange, presence }: DeckBoardProps) {
  const navigate = useNavigate();
  const isLight = mode === "light";
  const syncedSignaturesRef = useRef<Map<string, string>>(new Map());
  const syncedTemplatesRef = useRef<Map<string, DeckTemplate>>(new Map());
  const localOnlyTemplateIdsRef = useRef<Set<string>>(new Set());

  const appRole = resolveAppRole(user?.roles ?? [], user?.appRole);
  const canContribute = appRole === "TL" || appRole === "Pilot";
  const canDelete = appRole === "TL";
  const editMode = canContribute ? viewMode : "view";
  const [mapConfigs, setMapConfigs] = useState<MapConfigDoc[]>([]);
  const [selectedMap, setSelectedMap] = useState<DeckMap>(MAP_FALLBACK_OPTIONS[0]);
  const [mapTileMode, setMapTileMode] = useState<MapTileMode>("static");
  const [showGridOverlay, setShowGridOverlay] = useState(false);
  const [iframeZoom, setIframeZoom] = useState(0.6);
  const [templates, setTemplates] = useState<DeckTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [quickslotId, setQuickslotId] = useState("quickslots-default");
  const [quickslots, setQuickslots] = useState<QuickslotEntry[]>([]);
  const [quickslotSaving, setQuickslotSaving] = useState(false);
  const [draggingQuickslot, setDraggingQuickslot] = useState<QuickslotKey | null>(null);
  const [deckLoading, setDeckLoading] = useState(false);
  const [deckSaving, setDeckSaving] = useState(false);
  const [deckError, setDeckError] = useState("");
  const [parsingBuildKeys, setParsingBuildKeys] = useState<Set<string>>(() => new Set());
  const [mechs, setMechs] = useState<MechDoc[]>([]);
  const [configuredMechs, setConfiguredMechs] = useState<ConfigMech[]>([]);
  const [deckRoleOptions, setDeckRoleOptions] = useState<string[]>([]);
  const [maproomUrlInput, setMaproomUrlInput] = useState("");
  const [maproomSaving, setMaproomSaving] = useState(false);
  const [maproomNotice, setMaproomNotice] = useState("");
  const [copiedCell, setCopiedCell] = useState<CopiedCell | null>(null);
  const maproomUrlInputRef = useRef<HTMLInputElement | null>(null);
  const textInputDebounceRef = useRef<Map<string, number>>(new Map());

  void hasRole;
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
    setIframeZoom(0.6);
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
  const configuredByNormalizedPair = useMemo(
    () => {
      const map = new Map<string, ConfigMech>();
      const ambiguousKeys = new Set<string>();
      for (const mech of configuredMechs) {
        for (const key of getConfigPairLookupKeys(mech)) {
          if (ambiguousKeys.has(key)) continue;
          const existing = map.get(key);
          if (existing && existing.key !== mech.key) {
            map.delete(key);
            ambiguousKeys.add(key);
            continue;
          }
          map.set(key, mech);
        }
      }
      return map;
    },
    [configuredMechs],
  );
  const configuredByNormalizedChassis = useMemo(() => {
    const map = new Map<string, ConfigMech[]>();
    for (const mech of configuredMechs) {
      const key = normalizeChassisToken(mech.chassis);
      const list = map.get(key) ?? [];
      list.push(mech);
      map.set(key, list);
    }
    return map;
  }, [configuredMechs]);
  const mechsByNormalizedPair = useMemo(() => {
    const map = new Map<string, MechDoc[]>();
    for (const mech of mechs) {
      const configured = configuredByNormalizedPair.get(getPairLookupKey(mech.chassis, mech.variant));
      const key = configured
        ? getPairLookupKey(configured.chassis, configured.variant)
        : getPairLookupKey(mech.chassis, mech.variant);
      const list = map.get(key) ?? [];
      list.push(mech);
      map.set(key, list);
    }
    
    return map;
  }, [configuredByNormalizedPair, mechs]);
  const buildOptionsByPair = useMemo(() => {
    const map = new Map<string, BuildOption[]>();
    for (const [key, docs] of mechsByNormalizedPair.entries()) {
      if (!docs.length) continue;
      const seen = new Set<string>();
      const options: BuildOption[] = [];
      
      for (const doc of docs) {
        // Pick only the preferred build code for this mech variant
        // Different builds (different weaponry) are separate docs, so each gets one option
        const preferredCode = getPreferredBuildCode(doc.buildCodes);
        const label = doc.weaponry?.trim() || `${doc.variant} | ${doc.chassis}`;
        const dedupeKey = doc.id;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        options.push({
          label,
          code: preferredCode,
          skillTreeCode: getMechSkillTreeCode(doc),
          mechId: doc.id,
          mechLabel: doc.name?.trim() ? `${doc.variant} / ${doc.name.trim()}` : doc.variant,
          submittedAt: formatSubmissionDate(doc.submittedAt, doc._ts),
          suggestedBuild: Boolean(doc.suggestedBuild),
        });
      }
      options.sort((a, b) => Number(b.suggestedBuild) - Number(a.suggestedBuild));
      map.set(key, options);
    }
    return map;
  }, [mechsByNormalizedPair]);
  const buildOptionsByChassis = useMemo(() => {
    const map = new Map<string, BuildOption[]>();
    for (const docs of mechsByNormalizedPair.values()) {
      if (!docs.length) continue;
      const chassisKey = normalizeChassisToken(docs[0].chassis);
      const list = map.get(chassisKey) ?? [];
      const seen = new Set(list.map((entry) => entry.mechId));

      for (const doc of docs) {
        // Pick only the preferred build code for this mech variant
        const preferredCode = getPreferredBuildCode(doc.buildCodes);
        const label = doc.weaponry?.trim() || doc.variant;
        const dedupeKey = doc.id;
        
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        list.push({
          label,
          code: preferredCode,
          skillTreeCode: getMechSkillTreeCode(doc),
          mechId: doc.id,
          mechLabel: doc.name?.trim() ? `${doc.variant} / ${doc.name.trim()}` : doc.variant,
          submittedAt: formatSubmissionDate(doc.submittedAt, doc._ts),
          suggestedBuild: Boolean(doc.suggestedBuild),
        });
      }

      list.sort((a, b) => Number(b.suggestedBuild) - Number(a.suggestedBuild));

      map.set(chassisKey, list);
    }
    return map;
  }, [mechsByNormalizedPair]);
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
          name: doc.name,
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
  const repositoryMechByBuildCode = useMemo(() => {
    const map = new Map<string, MechDoc>();
    const ambiguous = new Set<string>();
    for (const mech of mechs) {
      for (const { code } of getBuildCodeEntries(mech.buildCodes)) {
        const key = code.trim();
        if (!key || ambiguous.has(key)) continue;
        if (map.has(key)) {
          map.delete(key);
          ambiguous.add(key);
        } else {
          map.set(key, mech);
        }
      }
    }
    return map;
  }, [mechs]);
  const repositoryMechByBuildUrl = useMemo(() => {
    const map = new Map<string, MechDoc>();
    const ambiguous = new Set<string>();
    for (const mech of mechs) {
      const key = (mech.link || mech.buildUrl || "").trim();
      if (!key || ambiguous.has(key)) continue;
      if (map.has(key)) {
        map.delete(key);
        ambiguous.add(key);
      } else {
        map.set(key, mech);
      }
    }
    return map;
  }, [mechs]);
  const resolveRowRepositoryMech = (row: DeckRow): MechDoc | undefined => (
    mechLookup.get(row.mech) ??
    repositoryMechById.get(row.mech) ??
    repositoryMechByBuildCode.get((row.buildCode ?? "").trim()) ??
    repositoryMechByBuildUrl.get((row.buildUrl ?? "").trim())
  );
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

  const currentUserIdentitySet = useMemo(() => {
    const values = [(user?.username ?? "").trim().toLowerCase(), (user?.id ?? "").trim().toLowerCase()];
    return new Set(values.filter(Boolean));
  }, [user?.id, user?.username]);

  const resolveConfigMechByRowSelection = (chassis: string, variant: string): ConfigMech | undefined => {
    const exact = configuredByNormalizedPair.get(getPairLookupKey(chassis, variant));
    if (exact) return exact;

    const normalizedChassis = normalizeChassisToken(chassis);
    const candidates = configuredByNormalizedChassis.get(normalizedChassis) ?? [];
    if (!candidates.length) return undefined;

    const normalizedVariant = normalizeVariantToken(variant);
    if (!normalizedVariant) {
      return candidates[0];
    }

    return (
      candidates.find((candidate) => normalizeVariantToken(candidate.variant) === normalizedVariant) ??
      candidates.find((candidate) => normalizedVariant.startsWith(normalizeVariantToken(candidate.variant))) ??
      candidates.find((candidate) => normalizeVariantToken(candidate.variant).startsWith(normalizedVariant))
    );
  };

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
    () => fixedMapQuickslots.filter((entry) => entry.deckId),
    [fixedMapQuickslots],
  );

  useEffect(() => {
    if (!templatesForSelection.length) return;
    const exists = templatesForSelection.some((template) => template.id === selectedTemplateId);
    if (!exists) {
      if (localOnlyTemplateIdsRef.current.has(selectedTemplateId)) {
        // Local-only template not yet in templatesForSelection - don't clobber
        return;
      }
      setSelectedTemplateId(templatesForSelection[0].id);
    }
  }, [templatesForSelection, selectedTemplateId]);

  const activeTemplate =
    templatesForSelection.find((template) => template.id === selectedTemplateId) ?? templatesForSelection[0];

  const resolveRowConfigMech = (row: DeckRow): ConfigMech | undefined => {
    const rowMech = resolveRowRepositoryMech(row);
    return resolveConfigMechByRowSelection(row.chassis || rowMech?.chassis || "", row.variant || rowMech?.variant || "");
  };

  const computeTemplateTonnage = (template?: DeckTemplate) => {
    if (!template) return 0;
    return template.rows.reduce((sum, row) => {
      const byId = resolveRowRepositoryMech(row)?.tonnage;
      const byConfig = configuredByKey.get(row.mech)?.tonnage;
      const byPair = resolveRowConfigMech(row)?.tonnage;
      return sum + (byId ?? byConfig ?? byPair ?? (typeof row.tonnage === "number" ? row.tonnage : 0));
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
      const rowMech = resolveRowRepositoryMech(row);
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

  const parseBuildUrlForRow = async (templateId: string, rowIndex: number, url: string) => {
    const parsingKey = `${templateId}:${rowIndex}`;
    setParsingBuildKeys((current) => new Set(current).add(parsingKey));
    setDeckError("");
    try {
      const parsed = await parseMechBuild(url);
      const draft = parsed.draft;
      updateRow(templateId, rowIndex, (row) => ({
        ...row,
        mech: "",
        chassis: draft.chassis,
        variant: draft.variant,
        weaponry: draft.weaponry,
        equipmentText: (draft.metadata.equipment ?? draft.equipment ?? []).join(", "),
        buildUrl: parsed.sourceUrl || draft.buildUrl || draft.link || url,
        role: draft.role,
        buildCode: getPreferredBuildCode(draft.buildCodes),
        skillTree: getAvailableCode(draft.skillTreeCode) || getAvailableCode(draft.skillCode),
        weightClass: draft.class,
        tonnage: draft.tonnage ?? row.tonnage,
      }));
      return draft.weaponry;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to parse build link";
      setDeckError(`Could not parse build link for slot ${rowIndex + 1}: ${message}`);
      return undefined;
    } finally {
      setParsingBuildKeys((current) => {
        const next = new Set(current);
        next.delete(parsingKey);
        return next;
      });
    }
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

  const setRowChassisVariant = (templateId: string, rowIndex: number, value: { mechId: string; chassis: string; variant: string }) => {
    updateRow(templateId, rowIndex, (row) => {
      const build =
        (value.mechId ? mechLookup.get(value.mechId) : undefined) ??
        mechsByNormalizedPair.get(getPairLookupKey(value.chassis, value.variant))?.[0];
      const configSelection = resolveConfigMechByRowSelection(value.chassis, value.variant);
      return {
        ...row,
        mech: build?.id ?? value.mechId ?? "",
        chassis: value.chassis,
        variant: value.variant,
        weaponry: build?.weaponry ?? "",
        buildUrl: build?.link || build?.buildUrl || "",
        buildCode: build ? getPreferredBuildCode(build.buildCodes) : "",
        role: build?.role ?? row.role ?? "",
        skillTree: getMechSkillTreeCode(build) || row.skillTree || "",
        weightClass: build?.class ?? configSelection?.class ?? row.weightClass,
        tonnage: build?.tonnage ?? configSelection?.tonnage ?? row.tonnage,
        equipmentText: build ? (build.metadata?.equipment ?? build.equipment ?? []).join(", ") : row.equipmentText,
      };
    });
  };

  const clearRowSlot = (templateId: string, rowIndex: number) => {
    updateRow(templateId, rowIndex, (row) => normalizeRow(row.slot));
  };

  const clearPilotColumn = (templateId: string, field: "primary" | "alternates") => {
    updateTemplateById(templateId, (template) => ({
      ...template,
      rows: template.rows.map((row) => ({
        ...row,
        [field]: [],
      })),
    }));
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
    const params = new URLSearchParams({ view: "view" });
    if (mechId) {
      params.set("focusMechId", mechId);
    } else {
      if (chassis) params.set("focusChassis", chassis);
      if (variant) params.set("focusVariant", variant);
    }
    window.open(`/repository?${params.toString()}`, "_blank", "noopener,noreferrer");
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

  const ensureDeckIdForQuickslot = async (
    deckId?: string,
  ): Promise<string | undefined> => {
    if (!deckId) return undefined;
    // Just return the ID - it's a UUID, same whether saved or local
    // Autosave will handle persistence when 5+ slots are filled
    return deckId;
  };

  const persistQuickslots = async (entries: QuickslotEntry[]) => {
    const sorted = sortQuickslots(entries);
    setQuickslots(sorted);
    setQuickslotSaving(true);
    try {
      const saved = await saveQuickslots({ id: quickslotId, slots: sorted });
      setQuickslotId(saved.id || quickslotId);
      setQuickslots(sortQuickslots(saved.slots || []));
      setDeckError("");
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to save quickslots";
      setDeckError(errorMsg);
      setDeckError(errorMsg);
    } finally {
      setQuickslotSaving(false);
    }
  };

  const setQuickslotDeck = async (
    slot: QuickslotKey,
    deckId?: string,
  ) => {
    if (editMode !== "edit") return;

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
    if (editMode !== "edit" || sourceSlot === targetSlot) {
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

  const clearQuickslotDeck = (slot: QuickslotKey) => {
    void setQuickslotDeck(slot, undefined);
  };

  const duplicateDeck = (template: DeckTemplate) => {
    if (editMode !== "edit") return;

    const duplicate: DeckTemplate = {
      ...template,
      id: crypto.randomUUID(),
      name: getDuplicateTemplateName(template.name, templatesForSelection),
      revision: undefined,
      updatedAt: undefined,
      updatedBy: undefined,
      rows: template.rows.map((row) => ({
        ...row,
        primary: [...row.primary],
        alternates: [...row.alternates],
      })),
    };

    setTemplates((previous) => [...previous, duplicate]);
    setSelectedTemplateId(duplicate.id);
    const nextOpenQuickslot = fixedMapQuickslots.find((entry) => !entry.deckId)?.slot;
    if (nextOpenQuickslot) {
      void setQuickslotDeck(nextOpenQuickslot, duplicate.id);
    }
    setDeckError("");
  };

  const onMapChange = (map: DeckMap) => {
    setSelectedMap(map);
    const candidate = templates.find((template) => template.map === map);
    if (candidate) setSelectedTemplateId(candidate.id);
  };

  const saveMaproomUrl = async () => {
    if (!canDelete) {
      setDeckError("Only TL can update maproom links.");
      return;
    }

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

    const confirmed = window.confirm(`Delete deck "${template.name}"? This cannot be undone.`);
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
        const wasLocalOnly = localOnlyTemplateIdsRef.current.has(dirtyTemplate.id);
        localOnlyTemplateIdsRef.current.delete(dirtyTemplate.id);

        if (savedTemplate.id !== dirtyTemplate.id) {
          syncedSignaturesRef.current.delete(dirtyTemplate.id);
          syncedTemplatesRef.current.delete(dirtyTemplate.id);
          replaceQuickslotDeckId(dirtyTemplate.id, savedTemplate.id);
          if (selectedTemplateId === dirtyTemplate.id) {
            setSelectedTemplateId(savedTemplate.id);
          }
        }

        // If this was a local-only template, now persist the quickslot assignment server-side
        if (wasLocalOnly) {
          const updatedQuickslots = quickslots.map(
            (qs) => qs.deckId === dirtyTemplate.id ? { ...qs, deckId: savedTemplate.id } : qs
          );
          void persistQuickslots(updatedQuickslots);
        }

        setTemplates((previous) =>
          previous.map((template) =>
            template.id === dirtyTemplate.id
              ? mergeSavedTemplate(template, dirtyTemplate, savedTemplate)
              : template,
          ),
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
              previous.map((template) =>
                template.id === dirtyTemplate.id
                  ? mergeSavedTemplate(template, dirtyTemplate, latestTemplate)
                  : template,
              ),
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
      const inUseTemplateIds = new Set<string>([
        ...mapQuickslots.map((entry) => entry.deckId).filter((value): value is string => Boolean(value)),
        activeTemplate?.id ?? "",
      ]);
      const hasDirtyVisibleTemplate = templates.some((template) => {
        if (!inUseTemplateIds.has(template.id)) return false;
        return syncedSignaturesRef.current.get(template.id) !== templateSignature(template);
      });

      if (hasDirtyVisibleTemplate || deckSaving) {
        return;
      }

      try {
        const docs = await getDropDecks();
        if (!docs.length) {
          return;
        }

        const mapped = docs.map((doc) => {
          const template = toTemplate(doc);
          const synced = syncedTemplatesRef.current.get(template.id);
          if (synced && (synced.revision ?? 0) > (template.revision ?? 0)) return synced;
          return template;
        });
        const nextSignatures = new Map(mapped.map((template) => [template.id, templateSignature(template)]));
        const previousSignatures = syncedSignaturesRef.current;
        const signaturesChanged =
          nextSignatures.size !== previousSignatures.size ||
          mapped.some((template) =>
            previousSignatures.get(template.id) !== nextSignatures.get(template.id)
            || syncedTemplatesRef.current.get(template.id)?.revision !== template.revision,
          );

        if (!signaturesChanged) {
          return;
        }

        syncedSignaturesRef.current = nextSignatures;
        syncedTemplatesRef.current = new Map(mapped.map((template) => [template.id, template]));
        // Preserve local-only templates (fresh decks not yet saved to server)
        setTemplates((previous) => {
          const previousById = new Map(previous.map((template) => [template.id, template]));
          const merged = mapped.map((template) => {
            const current = previousById.get(template.id);
            if (!current) return template;
            return previousSignatures.get(template.id) !== templateSignature(current) ? current : template;
          });
          const localOnly = previous.filter(t => localOnlyTemplateIdsRef.current.has(t.id));
          return [...merged, ...localOnly];
        });
        setSelectedTemplateId((previous) => {
          // Keep selection if it's still on server OR is a local-only (unsaved) template
          if (mapped.some((template) => template.id === previous)) return previous;
          if (localOnlyTemplateIdsRef.current.has(previous)) return previous;
          return mapped[0]?.id ?? "";
        });
      } catch {
        // Keep stale data on screen until the next successful poll.
      }
    }, DECK_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeTemplate, deckSaving, mapQuickslots, templates]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        maxWidth: "100vw",
        overflowX: "clip",
        background:
          isLight
            ? LIGHT_VIEW_BACKGROUND
            : "radial-gradient(circle at 8% 10%, rgba(167, 196, 255, 0.18), transparent 35%), radial-gradient(circle at 90% 0%, rgba(119, 140, 191, 0.18), transparent 40%), #0c101d",
        pb: 3,
        "& .MuiPaper-root, & .MuiButton-root, & .MuiButtonGroup-root, & .MuiOutlinedInput-root, & .MuiAlert-root, & .MuiDialog-paper": {
          borderRadius: "0 !important",
        },
      }}
    >
      <AppBar
        data-testid="top-navbar"
        position="sticky"
        elevation={0}
        sx={{
          top: 0,
          zIndex: (theme) => theme.zIndex.appBar,
          background: isLight ? LIGHT_VIEW_APP_BAR : "rgba(9, 14, 28, 0.9)",
          borderBottom: isLight ? "1px solid rgba(111, 130, 160, 0.34)" : "1px solid rgba(130, 154, 217, 0.32)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Box sx={{ pl: { xs: 2, md: 6.5 }, pr: { xs: 1.5, md: 2.75 }, py: 1.25, display: "grid", gap: 1.25 }}>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={{ xs: 0.7, lg: 2.2 }} sx={{ alignItems: { xs: "stretch", lg: "center" }, justifyContent: "space-between", minWidth: 0 }}>
            <Stack direction={{ xs: "column", lg: "row" }} spacing={{ xs: 0.4, lg: 1.6 }} sx={{ alignItems: { xs: "stretch", lg: "center" }, minWidth: 0, flex: { lg: 1 } }}>
              <Typography sx={{ color: isLight ? "#2f3e58" : "#eff5ff", fontWeight: 700, letterSpacing: "0.02em", mr: 0.6, display: { xs: "none", md: "block" } }}>
                EXDEATE
              </Typography>

              <Tabs
                value="dropDecks"
                onChange={(_, value: string) => {
                  if (value === "repository") {
                    navigate("/repository");
                  }
                  if (value === "overview") {
                    navigate("/overview");
                  }
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
                <Tab label="Drop Decks" value="dropDecks" data-presence-focus="Drop Decks navigation" />
                <Tab label="Repository" value="repository" data-presence-focus="Repository navigation" />
                <Tab label="Overview" value="overview" data-presence-focus="Overview navigation" />
              </Tabs>

              <Divider
                orientation="vertical"
                flexItem
                sx={{
                  alignSelf: "stretch",
                  borderColor: isLight ? "rgba(108, 128, 158, 0.3)" : "rgba(130, 154, 217, 0.24)",
                  mx: 1.0,
                  display: { xs: "none", md: "block" },
                }}
              />

              <Tabs
                value={selectedMap}
                onChange={(_, value: DeckMap) => onMapChange(value)}
                variant="scrollable"
                scrollButtons={false}
                sx={{
                  minHeight: 38,
                  maxWidth: "100%",
                  "& .MuiTab-root": { color: isLight ? "#566987" : "#cbd6f6", minHeight: 38, minWidth: 0, py: 0, px: { xs: 1.1, sm: 1.6 } },
                  "& .Mui-selected": { color: isLight ? "#26364f" : "#ffffff" },
                }}
              >
                {mapOptions.map((map) => (
                  <Tab key={map} label={map} value={map} data-presence-focus={`Map: ${map}`} />
                ))}
              </Tabs>
            </Stack>

            <Stack direction="row" spacing={0.7} sx={{ ml: { lg: "auto" }, alignItems: "center", flexWrap: { xs: "wrap", lg: "nowrap" }, justifyContent: { xs: "flex-start", lg: "flex-end" }, minWidth: 0, flexShrink: 0 }}>
              <PresenceWidget presence={presence} />

              {user && (
                <Typography sx={{ color: isLight ? "#556987" : "#cbd6f6", fontSize: "0.92rem", display: { xs: "none", sm: "block" }, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.username}
                </Typography>
              )}

              <Button
                data-presence-focus="Add Build"
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
                  flexShrink: 0,
                  fontWeight: 700,
                  "&:hover": {
                    background: isLight ? "rgba(58, 111, 189, 0.95)" : "rgba(127, 179, 255, 0.28)",
                  },
                }}
              >
                Add Build
              </Button>

              <Tooltip title={isLight ? "Switch to dark mode" : "Switch to light mode"}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={onToggleMode}
                  aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
                  sx={{
                    minWidth: 38,
                    width: 38,
                    height: 38,
                    flexShrink: 0,
                    p: 0,
                    color: isLight ? "#4e6486" : "#c8d8ff",
                    borderColor: isLight ? "rgba(108, 128, 158, 0.35)" : "rgba(130, 154, 217, 0.32)",
                  }}
                >
                  {isLight ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
                </Button>
              </Tooltip>

              <Button
                aria-label={`Deck mode: ${editMode === "edit" ? "Editing" : "Viewing"}`}
                variant="outlined"
                size="small"
                disabled={!canContribute}
                onClick={() => onViewModeChange(editMode === "edit" ? "view" : "edit")}
                sx={{
                  color: editMode === "edit"
                    ? (isLight ? "#315f9e" : "#8fbdff")
                    : (isLight ? "#526b91" : "#b7c9ee"),
                  borderColor: editMode === "edit"
                    ? (isLight ? "rgba(49, 95, 158, 0.55)" : "rgba(143, 189, 255, 0.55)")
                    : (isLight ? "rgba(82, 107, 145, 0.48)" : "rgba(183, 201, 238, 0.46)"),
                  minHeight: 38,
                  minWidth: 82,
                  flexShrink: 0,
                  px: 1.6,
                  textTransform: "none",
                  "&.Mui-disabled": {
                    color: isLight ? "#60789d" : "#b7c9ee",
                    borderColor: isLight ? "rgba(96, 120, 157, 0.48)" : "rgba(183, 201, 238, 0.46)",
                    opacity: 1,
                  },
                }}
              >
                {editMode === "edit" ? "Editing" : "Viewing"}
              </Button>

              <Button
                variant="outlined"
                size="small"
                onClick={onLogout}
                sx={{
                  textTransform: "none",
                  color: isLight ? "#4e6486" : "#c8d8ff",
                  borderColor: isLight ? "rgba(108, 128, 158, 0.35)" : "rgba(130, 154, 217, 0.32)",
                  minHeight: 38,
                  flexShrink: 0,
                  px: 1.5,
                }}
              >
                Logout
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
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", justifyContent: "space-between", px: 0.4 }}
                  >
                    <Typography variant="caption" sx={{ color: isLight ? "#5b6f90" : "#b8c9ef", fontWeight: 700, letterSpacing: "0.03em" }}>
                      MAP VIEW
                    </Typography>
                    <Stack direction="row" spacing={0.8} sx={{ alignItems: "center" }}>
                      {mapTileMode === "static" && (
                        <Button
                          variant={showGridOverlay ? "contained" : "outlined"}
                          size="small"
                          onClick={() => setShowGridOverlay((prev) => !prev)}
                          disabled={!hasGridOverlay}
                          sx={{ textTransform: "none" }}
                        >
                          {showGridOverlay ? "Grid On" : "Grid Off"}
                        </Button>
                      )}
                      <ButtonGroup size="small" variant="outlined">
                        <Button
                          variant={mapTileMode === "static" ? "contained" : "outlined"}
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
                      </ButtonGroup>
                    </Stack>
                  </Stack>

                  {mapTileMode === "iframe" && (
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "minmax(0, 1fr)",
                          sm: "minmax(0, 1fr) auto",
                          md: canDelete && editMode === "edit"
                            ? "minmax(260px, 1fr) auto 96px"
                            : "minmax(260px, 1fr) 96px",
                        },
                        gridTemplateAreas: {
                          xs: canDelete && editMode === "edit"
                            ? '"url" "save" "viewport"'
                            : '"url" "viewport"',
                          sm: canDelete && editMode === "edit"
                            ? '"url save" "viewport viewport"'
                            : '"url url" "viewport viewport"',
                          md: canDelete && editMode === "edit"
                            ? '"url save viewport"'
                            : '"url viewport"',
                        },
                        gap: 1,
                        alignItems: "end",
                        px: 0.4,
                      }}
                    >
                      <TextField
                        label="Maproom URL"
                        size="small"
                        value={maproomUrlInput}
                        onChange={(event) => setMaproomUrlInput(event.target.value)}
                        disabled={!canDelete || editMode !== "edit"}
                        inputRef={maproomUrlInputRef}
                        fullWidth
                        sx={{ gridArea: "url" }}
                      />
                      {canDelete && editMode === "edit" && (
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => {
                            void saveMaproomUrl();
                          }}
                          disabled={maproomSaving}
                          sx={{ gridArea: "save", textTransform: "none", minHeight: 40, whiteSpace: "nowrap" }}
                        >
                          {maproomSaving ? "Saving..." : "Save Link"}
                        </Button>
                      )}
                      <Box sx={{ gridArea: "viewport", width: { xs: "100%", sm: 96 }, justifySelf: { sm: "end" } }}>
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
                            fullWidth
                            slotProps={{ htmlInput: { step: 0.1, min: 0.6, max: 2.2 } }}
                          />
                      </Box>
                    </Box>
                  )}

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
                            transform: `translate(-50%, -50%) scale(${iframeZoom})`,
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
                  background: isLight ? LIGHT_VIEW_PANEL : "rgba(11, 16, 33, 0.9)",
                }}
              >
                <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                  <Typography variant="caption" sx={{ color: isLight ? "#5b6f90" : "#b8c9ef", fontWeight: 700, letterSpacing: "0.03em" }}>
                    QUICKSLOTS ({selectedMap})
                  </Typography>
                </Stack>
                <Stack spacing={1}>
                  {mapQuickslots.length === 0 && (
                    <Typography variant="body2" sx={{ color: isLight ? "#60779d" : "#a9bfef" }}>
                      No decks assigned yet for this map. Use the deck selector below to assign or create one.
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
                        if (editMode === "edit" && draggingQuickslot) {
                          reorderQuickslotDecks(draggingQuickslot, entry.slot);
                        }
                        setDraggingQuickslot(null);
                      }}
                    >
                      <Stack direction="row" spacing={0.2} sx={{ alignItems: "center", minWidth: 90 }}>
                        <Tooltip title={entry.deckId ? "Drag to reorder deck slots" : "Assign a deck to enable drag reorder"}>
                          <Box
                            draggable={editMode === "edit" && Boolean(entry.deckId)}
                            onDragStart={() => setDraggingQuickslot(entry.slot)}
                            onDragEnd={() => setDraggingQuickslot(null)}
                            sx={{
                              display: "inline-flex",
                              cursor: editMode === "edit" && entry.deckId ? "grab" : "not-allowed",
                              opacity: editMode === "edit" && entry.deckId ? 1 : 0.45,
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
                      <FormControl size="small" sx={{ flex: 1, minWidth: { xs: 0, sm: 220 }, width: { xs: "100%", sm: "auto" } }}>
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
                          disabled={editMode !== "edit"}
                          onChange={(event) => {
                            const value = String(event.target.value);
                            if (value === "__new__") {
                              // Create fresh deck locally only - do NOT persist the quickslot yet
                              // (server rejects decks with < 5 filled slots; quickslot will be saved
                              // by the autosave after the deck is filled and saved to the server)
                              const fresh = createTemplate(selectedMap, activeTemplate?.side ?? "either", templatesForSelection.length + 1);
                              
                              // Build the local quickslot assignment for this fresh deck
                              const rest = quickslots.filter((qslot) => !(qslot.map === selectedMap && qslot.slot === entry.slot));
                              const newQuickslots = [...rest, { map: selectedMap, slot: entry.slot, deckId: fresh.id }];
                              
                              // Track as local-only so polls don't drop it
                              localOnlyTemplateIdsRef.current.add(fresh.id);
                              setTemplates((previous) => [...previous, fresh]);
                              setSelectedTemplateId(fresh.id);
                              setQuickslots(sortQuickslots(newQuickslots));
                              return;
                            }
                            const alreadyAssigned = fixedMapQuickslots.some((slotEntry) => slotEntry.slot !== entry.slot && slotEntry.deckId === value);
                            if (alreadyAssigned) {
                              setDeckError("That deck is already assigned to another quickslot for this map.");
                              return;
                            }
                            setQuickslotDeck(entry.slot, value || undefined).catch(() => {});
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
                      <Button variant="text" color="inherit" onClick={() => clearQuickslotDeck(entry.slot)} disabled={editMode !== "edit" || !entry.deckId}>
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
              const updatedAtMs = template.updatedAt ? Date.parse(template.updatedAt) : Number.NaN;
              const recentlyUpdated = Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs < LIVE_EDITOR_WINDOW_MS;
              const updatedByLabel = (template.updatedBy ?? "").trim();
              const normalizedUpdatedBy = updatedByLabel.toLowerCase();
              const remoteEditor =
                recentlyUpdated &&
                Boolean(updatedByLabel) &&
                !currentUserIdentitySet.has(normalizedUpdatedBy)
                  ? isLikelyDiscordSnowflake(updatedByLabel)
                    ? "a teammate"
                    : updatedByLabel
                  : null;

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
                      border: remoteEditor
                        ? isLight
                          ? "1px solid rgba(56, 140, 97, 0.55)"
                          : "1px solid rgba(96, 212, 155, 0.6)"
                        : isLight
                          ? "1px solid rgba(114, 133, 162, 0.34)"
                          : "1px solid rgba(130, 154, 217, 0.35)",
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
                        {remoteEditor && (
                          <Typography variant="caption" sx={{ color: isLight ? "#26724f" : "#6fe2ad", fontWeight: 700 }}>
                            Live edit indicator: {remoteEditor} updated this deck recently.
                          </Typography>
                        )}
                      </Stack>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                        <TextField
                          size="small"
                          label="Deck Name"
                          value={template.name ?? ""}
                          disabled={editMode !== "edit"}
                          onChange={(event) => {
                            const nextName = event.target.value;
                            updateTemplateById(template.id, (current) => {
                              if ((current.name ?? "") === nextName) return current;
                              return {
                                ...current,
                                name: nextName,
                              };
                            });
                          }}
                          sx={{ minWidth: { xs: 0, sm: 220 }, width: { xs: "100%", sm: "auto" } }}
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
                        <Typography sx={{ color: isLight ? "#556887" : "#bfd0ff", fontWeight: 700 }}>
                          Total Tonnage: {computeTemplateTonnage(template)} t
                        </Typography>
                        <Box sx={{ width: 28, height: 28, display: "grid", placeItems: "center", flexShrink: 0 }}>
                          {cs26Validation.issues.length > 0 && (
                            <Tooltip
                              title={cs26Validation.issues.map((issue) => issue.message).join("\n")}
                              slotProps={{ tooltip: { sx: { whiteSpace: "pre-line" } } }}
                            >
                              <IconButton size="small" aria-label="Show CS26 issues" sx={{ color: "#f59e0b", p: 0.25 }}>
                                <WarningAmberIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<ContentCopyIcon fontSize="small" />}
                          disabled={editMode !== "edit"}
                          onClick={() => duplicateDeck(template)}
                        >
                          Duplicate Deck
                        </Button>
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
                          {TABLE_HEADERS.map((header, headerIndex) => {
                            const clearField = header === "Primary" ? "primary" : header === "Alternates" ? "alternates" : null;
                            return (
                              <Stack
                                key={`${header}-${headerIndex}`}
                                direction="row"
                                spacing={0.35}
                                sx={{
                                  alignItems: "center",
                                  justifyContent: clearField ? "space-between" : "flex-start",
                                  minWidth: 0,
                                  width: "100%",
                                }}
                              >
                                <Typography
                                  variant="caption"
                                  sx={{ color: isLight ? "#4f6282" : "#c9d8ff", fontWeight: 700, letterSpacing: "0.02em", display: "inline-flex", alignItems: "center", gap: 0.35 }}
                                >
                                  {header}
                                </Typography>
                                {clearField && editMode === "edit" && (
                                  <Tooltip title={`Clear ${clearField === "primary" ? "primary" : "alternate"} pilots`}>
                                    <IconButton
                                      size="small"
                                      onClick={() => clearPilotColumn(template.id, clearField)}
                                      aria-label={`Clear ${clearField === "primary" ? "primary" : "alternate"} pilots`}
                                      sx={{ color: isLight ? "#7d8fae" : "#9ab8ef", p: 0.25, mr: 0.5, flexShrink: 0 }}
                                    >
                                      <BackspaceIcon fontSize="inherit" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Stack>
                            );
                          })}
                        </Box>

                        <Stack spacing={0.6} sx={{ pt: 0.8 }}>
                          {template.rows.map((row, rowIndex) => {
                            const mech = resolveRowRepositoryMech(row);
                            const mappedConfigKey = repoIdToAllKey.get(mech?.id ?? row.mech);
                            const configMech = configuredByKey.get(row.mech) ?? (mappedConfigKey ? configuredByKey.get(mappedConfigKey) : undefined);
                            const rowChassis = row.chassis || mech?.chassis || configMech?.chassis || "";
                            const rowVariant = row.variant || mech?.variant || configMech?.variant || "";
                            const readableMechLabel = [rowChassis, rowVariant].filter(Boolean).join(" / ");
                            const mechLabel = readableMechLabel
                              ? `${readableMechLabel}${mech?.name?.trim() ? ` / ${mech.name.trim()}` : ""}`
                              : isUuid(row.mech) ? "Unknown mech" : row.mech || "-";
                            const normalizedChassis = normalizeChassisToken(rowChassis);
                            const normalizedVariant = normalizeVariantToken(rowVariant);
                            const selectedConfigMech = resolveConfigMechByRowSelection(rowChassis, rowVariant);
                            const buildOptions = (() => {
                              const pairKey = selectedConfigMech
                                ? getPairLookupKey(selectedConfigMech.chassis, selectedConfigMech.variant)
                                : `${normalizedChassis}|${normalizedVariant}`;
                              const options = normalizedVariant
                                ? [...(buildOptionsByPair.get(pairKey) ?? [])]
                                : [...(buildOptionsByChassis.get(normalizedChassis) ?? [])];

                              if (!options.length && mech?.buildCodes) {
                                const seen = new Set(options.map((option) => option.mechId));
                                for (const { key, code } of getBuildCodeEntries(mech.buildCodes)) {
                                  const dedupeKey = `${mech.id}:${key}`;
                                  if (seen.has(dedupeKey)) continue;
                                  seen.add(dedupeKey);
                                  options.push({
                                    label: mech.weaponry?.trim() || key,
                                    code,
                                    skillTreeCode: getMechSkillTreeCode(mech),
                                    mechId: dedupeKey,
                                    mechLabel: mech.name?.trim() ? `${mech.variant} / ${mech.name.trim()}` : mech.variant,
                                    submittedAt: formatSubmissionDate(mech.submittedAt, mech._ts),
                                    suggestedBuild: Boolean(mech.suggestedBuild),
                                  });
                                }
                              }

                              return options;
                            })();
                            const rowClass = mech?.class ?? configMech?.class ?? selectedConfigMech?.class ?? "-";
                            const rowClassLabel = asWeightClassLabel(rowClass);
                            const rowClassTheme = rowClassLabel ? WEIGHT_CLASS_GRADIENTS[rowClassLabel] : null;
                            const rowTonnage = mech?.tonnage ?? configMech?.tonnage ?? selectedConfigMech?.tonnage ?? row.tonnage;
                            const hasSelectedRepositoryBuild = Boolean(mech);
                            const exportCode = getAvailableCode(row.buildCode);
                            const skillTreeCode = getAvailableCode(row.skillTree || getMechSkillTreeCode(mech));
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
                                  boxShadow: "none",
                                  "&:focus-within": {
                                    border: isLight
                                      ? "1px solid rgba(70, 136, 223, 0.72)"
                                      : "1px solid rgba(129, 188, 255, 0.8)",
                                    boxShadow: isLight
                                      ? "0 0 0 1px rgba(70, 136, 223, 0.18) inset"
                                      : "0 0 0 1px rgba(129, 188, 255, 0.24) inset",
                                  },
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
                                        {pilot}
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
                                        {pilot}
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
                                        selectedName={mech?.name}
                                        allConfiguredMechs={configuredMechs}
                                        repositoryMechs={repositoryMechs}
                                        repoIdToAllKey={repoIdToAllKey}
                                        source="config"
                                        onChange={(value) => setRowChassisVariant(template.id, rowIndex, value)}
                                        disabled={false}
                                      />
                                    ) : (
                                      <Typography sx={{ color: isLight ? "#4f6282" : "#d3ddfc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {mechLabel}
                                      </Typography>
                                    )}
                                  </Box>
                                </Stack>

                                {(() => {
                                  if (!rowClassLabel || !rowClassTheme) {
                                    return (
                                      <Typography
                                        variant="body2"
                                        sx={{
                                          color: isLight ? "#4f6282" : "#d3ddfc",
                                          fontSize: "0.85rem",
                                          letterSpacing: "0.01em",
                                        }}
                                      >
                                        {rowClass}
                                      </Typography>
                                    );
                                  }
                                  return (
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontSize: "0.85rem",
                                        fontWeight: 700,
                                        letterSpacing: "0.01em",
                                        lineHeight: 1.2,
                                        color: isLight ? rowClassTheme.lightFallback : rowClassTheme.darkFallback,
                                        backgroundImage: isLight ? rowClassTheme.lightGradient : rowClassTheme.darkGradient,
                                        WebkitBackgroundClip: "text",
                                        backgroundClip: "text",
                                        WebkitTextFillColor: "transparent",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {rowClassLabel}
                                    </Typography>
                                  );
                                })()}

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
                                  <BuildAutocompleteField
                                    value={row.weaponry ?? ""}
                                    options={buildOptions}
                                    parsing={parsingBuildKeys.has(`${template.id}:${rowIndex}`)}
                                    onParseUrl={(url) => parseBuildUrlForRow(template.id, rowIndex, url)}
                                    onCommit={(nextBuildText) => {
                                      updateRow(template.id, rowIndex, (entry) => {
                                        if ((entry.weaponry ?? "") === nextBuildText) return entry;
                                        return { ...entry, weaponry: nextBuildText };
                                      });
                                    }}
                                    onSelect={(option) => {
                                      updateRow(template.id, rowIndex, (entry) => {
                                        if (!option) return entry;
                                        const nextBuildCode = option.code.trim();
                                        if ((entry.weaponry ?? "") === option.label && (entry.buildCode ?? "") === nextBuildCode) return entry;
                                        
                                        return {
                                          ...entry,
                                          mech: option.mechId.split(":", 1)[0] ?? entry.mech,
                                          weaponry: option.label,
                                          buildCode: nextBuildCode,
                                          skillTree: option.skillTreeCode,
                                        };
                                      });
                                    }}
                                  />
                                ) : (
                                  <Typography variant="body2" sx={{ color: isLight ? "#4f6282" : "#d3ddfc", fontSize: "0.78rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {row.weaponry || mech?.weaponry || "-"}
                                  </Typography>
                                )}

                                <Stack direction="row" spacing={0.1} sx={{ alignItems: "center", minWidth: 0 }}>
                                  {editMode === "edit" ? (
                                    <HoverRevealCodeField
                                      value={exportCode}
                                      label={`Export code slot ${row.slot}`}
                                      disabled={false}
                                      onChange={(nextBuildCode) => {
                                        const commitKey = `export-code-${template.id}-${row.slot}`;
                                        scheduleTextInputCommit(commitKey, () => {
                                          updateRow(template.id, rowIndex, (entry) => ({ ...entry, buildCode: nextBuildCode }));
                                        });
                                      }}
                                      onBlur={(nextBuildCode) => {
                                        const commitKey = `export-code-${template.id}-${row.slot}`;
                                        flushTextInputCommit(commitKey, () => {
                                          updateRow(template.id, rowIndex, (entry) => ({ ...entry, buildCode: nextBuildCode }));
                                        });
                                      }}
                                    />
                                  ) : null}
                                  {exportCode ? (
                                    <Tooltip title={copiedCell?.templateId === template.id && copiedCell.slot === row.slot && copiedCell.field === "export" ? "Copied" : "Copy export code"}>
                                      <IconButton
                                        size="small"
                                        aria-label={`Copy export code slot ${row.slot}`}
                                        onClick={() => void copyBuildCode(exportCode, template.id, row.slot)}
                                        sx={{
                                          p: 0.25,
                                          flexShrink: 0,
                                          "&:hover": { background: isLight ? "rgba(176, 37, 29, 0.08)" : "rgba(231, 79, 67, 0.12)" },
                                          "&:hover img": {
                                            filter: isLight
                                              ? "drop-shadow(1px 0 #7f1712) drop-shadow(-1px 0 #7f1712) drop-shadow(0 1px #7f1712) drop-shadow(0 -1px #7f1712) drop-shadow(0 0 3px rgba(176, 37, 29, 0.8))"
                                              : "drop-shadow(1px 0 #fff) drop-shadow(-1px 0 #fff) drop-shadow(0 1px #fff) drop-shadow(0 -1px #fff) drop-shadow(0 0 3px rgba(255, 255, 255, 0.85))",
                                          },
                                        }}
                                      >
                                        <Box
                                          component="img"
                                          src={mechWarrior3Cutout}
                                          alt=""
                                          sx={{ width: 16, height: 22, objectFit: "contain", transition: "filter 120ms ease" }}
                                        />
                                      </IconButton>
                                    </Tooltip>
                                  ) : null}
                                </Stack>

                                <Stack direction="row" spacing={0.1} sx={{ alignItems: "center", minWidth: 0 }}>
                                  {editMode === "edit" ? (
                                    <HoverRevealCodeField
                                      value={skillTreeCode}
                                      label={`Skill tree code slot ${row.slot}`}
                                      disabled={false}
                                      onChange={(nextSkillTree) => {
                                        const commitKey = `skill-tree-${template.id}-${row.slot}`;
                                        scheduleTextInputCommit(commitKey, () => {
                                          updateRow(template.id, rowIndex, (entry) => {
                                            if ((entry.skillTree ?? "") === nextSkillTree) return entry;
                                            return { ...entry, skillTree: nextSkillTree };
                                          });
                                        });
                                      }}
                                      onBlur={(nextSkillTree) => {
                                        const commitKey = `skill-tree-${template.id}-${row.slot}`;
                                        flushTextInputCommit(commitKey, () => {
                                          updateRow(template.id, rowIndex, (entry) => {
                                            if ((entry.skillTree ?? "") === nextSkillTree) return entry;
                                            return { ...entry, skillTree: nextSkillTree };
                                          });
                                        });
                                      }}
                                    />
                                  ) : null}
                                  {skillTreeCode ? (
                                      <Tooltip title={copiedCell?.templateId === template.id && copiedCell.slot === row.slot && copiedCell.field === "skill" ? "Copied" : "Copy skill tree code"}>
                                        <IconButton
                                          size="small"
                                          aria-label={`Copy skill tree code slot ${row.slot}`}
                                          onClick={() => void copySkillTreeCode(skillTreeCode, template.id, row.slot)}
                                          sx={{
                                            color: isLight ? "#397348" : "#8fd9a4",
                                            background: isLight ? "rgba(57, 115, 72, 0.08)" : "rgba(143, 217, 164, 0.1)",
                                            border: isLight ? "1px solid rgba(57, 115, 72, 0.22)" : "1px solid rgba(143, 217, 164, 0.24)",
                                            p: 0.4,
                                            flexShrink: 0,
                                          }}
                                        >
                                          <ParkIcon fontSize="inherit" />
                                        </IconButton>
                                      </Tooltip>
                                  ) : null}
                                </Stack>

                                <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                                  {hasSelectedRepositoryBuild ? (
                                    <Tooltip title="Open this mech in Repository">
                                      <IconButton
                                        size="small"
                                        aria-label={`Open repository build slot ${row.slot}`}
                                        onClick={() => openMechInRepository(mech?.id, rowChassis, rowVariant)}
                                        sx={{
                                          p: 0.25,
                                          flexShrink: 0,
                                          "&:hover": { background: isLight ? "rgba(176, 37, 29, 0.08)" : "rgba(231, 79, 67, 0.12)" },
                                          "&:hover img": {
                                            filter: isLight
                                              ? "drop-shadow(1px 0 #7f1712) drop-shadow(-1px 0 #7f1712) drop-shadow(0 1px #7f1712) drop-shadow(0 -1px #7f1712) drop-shadow(0 0 3px rgba(176, 37, 29, 0.8))"
                                              : "drop-shadow(1px 0 #fff) drop-shadow(-1px 0 #fff) drop-shadow(0 1px #fff) drop-shadow(0 -1px #fff) drop-shadow(0 0 3px rgba(255, 255, 255, 0.85))",
                                          },
                                        }}
                                      >
                                        <Box
                                          component="img"
                                          src={mechWarrior3Cutout}
                                          alt=""
                                          sx={{ width: 16, height: 22, objectFit: "contain", transition: "filter 120ms ease" }}
                                        />
                                      </IconButton>
                                    </Tooltip>
                                  ) : null}
                                </Box>

                                <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                                  {editMode === "edit" ? (
                                    <Tooltip title="Clear slot">
                                      <IconButton
                                        size="small"
                                        onClick={() => clearRowSlot(template.id, rowIndex)}
                                        sx={{ color: isLight ? "#7d8fae" : "#9ab8ef", flexShrink: 0 }}
                                      >
                                        <BackspaceIcon fontSize="inherit" />
                                      </IconButton>
                                    </Tooltip>
                                  ) : null}
                                </Box>
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
                      background: isLight ? LIGHT_VIEW_PANEL : "rgba(11, 16, 33, 0.9)",
                    }}
                  >
                    <Typography variant="caption" sx={{ color: isLight ? "#5b6f90" : "#b8c9ef", fontWeight: 700, letterSpacing: "0.03em" }}>
                      STRATEGY | SLOT {slotEntry.slot}
                    </Typography>
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "2fr minmax(0, 1fr) minmax(0, 1fr)" },
                        gap: 1.25,
                        mt: 1,
                      }}
                    >
                      {([
                        ["description", "Description"],
                        ["initial", "Initial"],
                        ["ideal", "Ideal"],
                      ] as const).map(([field, label]) => (
                        <Box key={field} sx={{ minWidth: 0 }}>
                          <Typography
                            variant="caption"
                            sx={{ color: isLight ? "#5b6f90" : "#b8c9ef", fontWeight: 700 }}
                          >
                            {label}
                          </Typography>
                          <StrategyTextField
                            key={`${template.id}-${field}`}
                            value={template[field]}
                            disabled={editMode !== "edit"}
                            label={`${label} slot ${slotEntry.slot}`}
                            onCommit={(nextValue) => {
                              updateTemplateById(template.id, (current) => {
                                if (current[field] === nextValue) return current;
                                return { ...current, [field]: nextValue };
                              });
                            }}
                          />
                        </Box>
                      ))}
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
