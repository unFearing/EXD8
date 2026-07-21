import { Stack, Alert, Box, Button, AppBar, Container, Paper, Tooltip, ButtonGroup, Tab, Tabs, TextField, IconButton, Divider, FormControl, InputLabel, Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import VisibilityIcon from "@mui/icons-material/Visibility";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import { Typography } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { MechDoc, WeightClassSummary } from "../types/contracts";
import { deleteMech, getMechHierarchy, getMechs, parseMechBuild, updateMech } from "../api/client";
import type { DiscordUser } from "../hooks/useDiscordAuth";
import { AddBuildDialog } from "./AddBuildDialog";
import { resolveAppRole } from "../utils/discordRoles";

type EditMode = "view" | "edit";

interface RepositoryViewProps {
  mode: "light" | "dark";
  onToggleMode: () => void;
  user: DiscordUser | null;
  onLogout: () => void;
  hasRole: (roleId: string) => boolean;
  viewMode: EditMode;
  onViewModeChange: (mode: EditMode) => void;
}

const APP_ROLE_TEAM_LEAD = "TL";
const ERROR_DELETE_PERMISSION = "You can only delete your own builds unless you have TL role.";
const ERROR_DELETE_PERMISSION_NO_PERIOD = "You can only delete your own builds unless you have TL role";
const ERROR_SAVE_PERMISSION = "Only TL can edit builds.";
const ERROR_REPARSE_PERMISSION = "Only TL can re-run the parser.";
const TECH_ALL = "All";
const FILTER_ALL = "All";
const WEIGHT_CLASS_DEFAULT: "Light" | "Medium" | "Heavy" | "Assault" = "Light";
const MOXIE_BLUE = "#2f4f96";
const MOXIE_PAPER = "#f8b397";
const MOXIE_PAPER_SOFT = "#f9c0aa";
const MOXIE_NIGHT_BG = "#11182e";
const MOXIE_NIGHT_LINE = "#607dc8";
const MOXIE_NIGHT_TEXT = "#f2d3c0";
const MOXIE_INK_FONT = '"IBM Plex Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace';

type ParserReviewState = {
  mechId: string;
  sourceUrl: string;
  parsedDraft: MechDoc;
  differences: Array<{
    label: string;
    currentValue: string | string[];
    nextValue: string | string[];
  }>;
};

function formatReviewValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "(empty)";
  }

  const text = (value ?? "").trim();
  return text || "(empty)";
}

function getDisplayBuildCodes(codes: Record<string, string> | undefined): Array<[string, string]> {
  if (!codes) return [];
  const entries = Object.entries(codes)
    .filter(([key, value]) => key !== "imported" && Boolean((value ?? "").trim()))
    .map(([key, value]) => [key, value.trim()] as const);

  const seenValues = new Set<string>();
  const deduped: Array<[string, string]> = [];
  for (const [key, value] of entries) {
    const normalized = value.toLowerCase();
    if (seenValues.has(normalized)) continue;
    seenValues.add(normalized);
    deduped.push([key, value]);
  }
  return deduped;
}

export function RepositoryView({
  mode,
  onToggleMode,
  user,
  onLogout,
  hasRole: _hasRole,
  viewMode,
  onViewModeChange,
}: RepositoryViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isLight = mode === "light";
  const [hierarchy, setHierarchy] = useState<WeightClassSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openAddBuild, setOpenAddBuild] = useState(false);
  const [deletingMechId, setDeletingMechId] = useState<string | null>(null);
  const [savingMechId, setSavingMechId] = useState<string | null>(null);
  const [selectedWeightClass, setSelectedWeightClass] = useState<"Light" | "Medium" | "Heavy" | "Assault">(WEIGHT_CLASS_DEFAULT);
  const [selectedTech, setSelectedTech] = useState<"All" | "IS" | "Clan">(TECH_ALL);
  const [selectedTonnage, setSelectedTonnage] = useState<string>(FILTER_ALL);
  const [selectedRole, setSelectedRole] = useState<string>(FILTER_ALL);
  const [selectedSubmitter, setSelectedSubmitter] = useState<string>(TECH_ALL);
  const [weaponrySearch, setWeaponrySearch] = useState("");
  const editMode = viewMode;
  const [mechsById, setMechsById] = useState<Record<string, MechDoc>>({});
  const [descriptionDrafts, setDescriptionDrafts] = useState<Record<string, string>>({});
  const [focusTarget, setFocusTarget] = useState<{ mechId?: string; chassis?: string; variant?: string } | null>(null);
  const [highlightedMechId, setHighlightedMechId] = useState<string | null>(null);
  const [parserReview, setParserReview] = useState<ParserReviewState | null>(null);
  const [parsingMechId, setParsingMechId] = useState<string | null>(null);
  const canManageBuilds = resolveAppRole(user?.roles ?? [], user?.appRole) === APP_ROLE_TEAM_LEAD;
  const normalizedUserName = (user?.username ?? "").trim().toLowerCase();

  const canDeleteBuild = (build: MechDoc): boolean => {
    if (canManageBuilds) return true;
    const submitter = (build.submittedBy ?? "").trim().toLowerCase();
    return Boolean(normalizedUserName) && submitter === normalizedUserName;
  };

  const loadHierarchy = async () => {
    setLoading(true);
    try {
      const [hierarchyData, mechs] = await Promise.all([getMechHierarchy(), getMechs()]);
      setHierarchy(hierarchyData);
      setMechsById(Object.fromEntries(mechs.map((mech) => [mech.id, mech])));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repository");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHierarchy();
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const viewParam = query.get("view")?.toLowerCase();
    if (viewParam === "view") {
      onViewModeChange("view");
    }
    const focusMechId = query.get("focusMechId") ?? undefined;
    const focusChassis = query.get("focusChassis") ?? undefined;
    const focusVariant = query.get("focusVariant") ?? undefined;
    if (focusMechId || focusChassis) {
      setFocusTarget({ mechId: focusMechId, chassis: focusChassis, variant: focusVariant });
    }

    const navState = location.state as {
      openAddBuild?: boolean;
      focusMechId?: string;
      focusChassis?: string;
      focusVariant?: string;
    } | null;
    if (navState?.openAddBuild) {
      setOpenAddBuild(true);
    }
    if (navState?.focusMechId || navState?.focusChassis) {
      setFocusTarget({
        mechId: navState.focusMechId,
        chassis: navState.focusChassis,
        variant: navState.focusVariant,
      });
    }
    if (navState) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.search, location.state, navigate, onViewModeChange]);

  useEffect(() => {
    if (!focusTarget || loading) return;

    const normalize = (value: string) => value.toLowerCase().replace(/^clan\s+/, "").replace(/^inner sphere\s+/, "").trim();
    let targetId = focusTarget.mechId ?? "";
    if (!targetId && focusTarget.chassis) {
      const chassisNeedle = normalize(focusTarget.chassis);
      const variantNeedle = (focusTarget.variant ?? "").toLowerCase().trim();
      const found = Object.values(mechsById).find((mech) => {
        if (normalize(mech.chassis) !== chassisNeedle) return false;
        if (!variantNeedle) return true;
        return (mech.variant ?? "").toLowerCase().trim() === variantNeedle;
      });
      targetId = found?.id ?? "";
    }

    if (!targetId) {
      setFocusTarget(null);
      return;
    }

    const targetMech = mechsById[targetId];
    if (targetMech?.class && targetMech.class !== selectedWeightClass) {
      setSelectedWeightClass(targetMech.class);
      return;
    }

    const element = document.getElementById(`repo-mech-${targetId}`);
    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMechId(targetId);
    setFocusTarget(null);
  }, [focusTarget, loading, mechsById, selectedWeightClass]);

  useEffect(() => {
    if (!highlightedMechId) return;
    const timeout = window.setTimeout(() => setHighlightedMechId(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [highlightedMechId]);

  const handleDeleteMech = async (id: string) => {
    const build = mechsById[id];
    if (!build || !canDeleteBuild(build)) {
      setError(ERROR_DELETE_PERMISSION);
      return;
    }

    const confirmed = window.confirm("Delete this mech build? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    try {
      setDeletingMechId(id);
      await deleteMech(id);
      await loadHierarchy();
    } catch (err) {
      let errorMessage = "Failed to delete mech";
      if (err instanceof Error) {
        const statusCode = (err as Error & { status?: number }).status;
        if (statusCode === 403) {
          errorMessage = ERROR_DELETE_PERMISSION_NO_PERIOD;
        } else if (statusCode === 404) {
          errorMessage = "Mech not found or was already deleted";
        } else if (statusCode === 400) {
          errorMessage = "Invalid mech ID";
        } else if (statusCode === 500) {
          errorMessage = "Server error - could not delete mech";
        } else {
          errorMessage = err.message;
        }
      }
      setError(errorMessage);
    } finally {
      setDeletingMechId(null);
    }
  };

  const handleSaveBuild = async (id: string) => {
    if (!canManageBuilds) {
      setError(ERROR_SAVE_PERMISSION);
      return;
    }

    const source = mechsById[id];
    if (!source) {
      setError("Could not find build source document to save.");
      return;
    }

    const description = (descriptionDrafts[id] ?? source.description ?? "").trim();

    try {
      setSavingMechId(id);
      const saved = await updateMech(id, {
        ...source,
        description,
      });
      setMechsById((previous) => ({
        ...previous,
        [saved.id]: saved,
      }));
      setDescriptionDrafts((previous) => {
        if (!(id in previous)) {
          return previous;
        }
        const next = { ...previous };
        delete next[id];
        return next;
      });
      setError("");
      await loadHierarchy();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save build");
    } finally {
      setSavingMechId(null);
    }
  };

  const handleReparseBuild = async (id: string) => {
    if (!canManageBuilds) {
      setError(ERROR_REPARSE_PERMISSION);
      return;
    }

    const source = mechsById[id];
    if (!source) {
      setError("Could not find build source document to re-run parser.");
      return;
    }

    const sourceUrl = (source.buildUrl ?? source.link ?? "").trim();
    if (!sourceUrl) {
      setError("This build does not have a source URL to re-run the parser against.");
      return;
    }

    try {
      setParsingMechId(id);
      setError("");
      const parsed = await parseMechBuild(sourceUrl);
      const differences = [
        { label: "Role", currentValue: source.role, nextValue: parsed.draft.role },
        { label: "Weaponry", currentValue: source.weaponry, nextValue: parsed.draft.weaponry },
        { label: "Skill Code", currentValue: source.skillCode, nextValue: parsed.draft.skillCode },
        { label: "Build URL", currentValue: source.buildUrl ?? source.link, nextValue: parsed.draft.buildUrl ?? parsed.draft.link },
        {
          label: "Export Code",
          currentValue: source.buildCodes?.export ?? "",
          nextValue: parsed.draft.buildCodes?.export ?? "",
        },
        {
          label: "Equipment",
          currentValue: source.equipment ?? source.metadata?.equipment ?? [],
          nextValue: parsed.draft.equipment ?? parsed.draft.metadata.equipment ?? [],
        },
      ].filter((entry) => formatReviewValue(entry.currentValue) !== formatReviewValue(entry.nextValue));
      setParserReview({
        mechId: id,
        sourceUrl,
        parsedDraft: {
          ...source,
          ...parsed.draft,
          buildUrl: parsed.draft.buildUrl || source.buildUrl || source.link,
          link: parsed.draft.link || source.link,
        },
        differences,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to re-run parser");
    } finally {
      setParsingMechId(null);
    }
  };

  const applyParsedMarkdown = async () => {
    if (!parserReview) return;

    try {
      setSavingMechId(parserReview.mechId);
      const saved = await updateMech(parserReview.mechId, {
        ...parserReview.parsedDraft,
      });
      setMechsById((previous) => ({
        ...previous,
        [saved.id]: saved,
      }));
      setDescriptionDrafts((previous) => {
        if (!(parserReview.mechId in previous)) {
          return previous;
        }
        const next = { ...previous };
        delete next[parserReview.mechId];
        return next;
      });
      setParserReview(null);
      setError("");
      await loadHierarchy();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply parsed build");
    } finally {
      setSavingMechId(null);
    }
  };

  const submitterOptions = useMemo(() => {
    const values = Array.from(new Set(Object.values(mechsById).map((mech) => (mech.submittedBy ?? "").trim()).filter(Boolean)));
    return values.sort((a, b) => a.localeCompare(b));
  }, [mechsById]);

  const classScopedMechs = useMemo(
    () => Object.values(mechsById).filter((mech) => mech.class === selectedWeightClass),
    [mechsById, selectedWeightClass],
  );

  const tonnageOptions = useMemo(() => {
    const values = Array.from(new Set(classScopedMechs.map((mech) => Number(mech.tonnage)).filter((tonnage) => Number.isFinite(tonnage) && tonnage > 0)));
    values.sort((a, b) => a - b);
    return values;
  }, [classScopedMechs]);

  const roleOptions = useMemo(() => {
    const values = Array.from(new Set(classScopedMechs.map((mech) => (mech.role ?? "").trim()).filter(Boolean)));
    return values.sort((a, b) => a.localeCompare(b));
  }, [classScopedMechs]);

  useEffect(() => {
    if (selectedTonnage === FILTER_ALL) return;
    if (!tonnageOptions.some((tonnage) => String(tonnage) === selectedTonnage)) {
      setSelectedTonnage(FILTER_ALL);
    }
  }, [selectedTonnage, tonnageOptions]);

  useEffect(() => {
    if (selectedRole === FILTER_ALL) return;
    if (!roleOptions.includes(selectedRole)) {
      setSelectedRole(FILTER_ALL);
    }
  }, [roleOptions, selectedRole]);

  const matchesFilters = (buildId: string): boolean => {
    const mech = mechsById[buildId];
    if (!mech) return false;

    if (selectedTech !== TECH_ALL && (mech.tech ?? "") !== selectedTech) {
      return false;
    }

    if (selectedSubmitter !== TECH_ALL && (mech.submittedBy ?? "") !== selectedSubmitter) {
      return false;
    }

    if (selectedTonnage !== FILTER_ALL && String(mech.tonnage ?? "") !== selectedTonnage) {
      return false;
    }

    if (selectedRole !== FILTER_ALL && (mech.role ?? "").trim() !== selectedRole) {
      return false;
    }

    if (weaponrySearch.trim()) {
      const query = weaponrySearch.trim().toLowerCase();
      const haystack = `${mech.weaponry ?? ""} ${mech.description ?? ""} ${mech.role ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  };

  const filteredHierarchy = useMemo(() => {
    const byClass = hierarchy.filter((weightClass) => weightClass.class === selectedWeightClass);

    return byClass
      .map((weightClass) => {
        const chassis = weightClass.chassis
          .map((chassisEntry) => {
            const variants = chassisEntry.variants
              .map((variantEntry) => {
                const builds = variantEntry.builds.filter((build) => matchesFilters(build.id));
                return {
                  ...variantEntry,
                  builds,
                  buildCount: builds.length,
                };
              })
              .filter((variantEntry) => variantEntry.builds.length > 0);

            return {
              ...chassisEntry,
              variants,
              buildCount: variants.reduce((sum, variantEntry) => sum + variantEntry.builds.length, 0),
            };
          })
          .filter((chassisEntry) => chassisEntry.variants.length > 0);

        return {
          ...weightClass,
          chassis,
          buildCount: chassis.reduce((sum, chassisEntry) => sum + chassisEntry.buildCount, 0),
        };
      })
      .filter((weightClass) => weightClass.chassis.length > 0);
  }, [hierarchy, matchesFilters, selectedWeightClass]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: isLight
          ? "radial-gradient(circle at 14% 6%, rgba(248, 179, 151, 0.4), transparent 32%), radial-gradient(circle at 86% 2%, rgba(255, 212, 184, 0.38), transparent 38%), #fbe9de"
          : `radial-gradient(circle at 14% 5%, rgba(96, 125, 200, 0.24), transparent 35%), radial-gradient(circle at 86% 2%, rgba(248, 179, 151, 0.16), transparent 40%), ${MOXIE_NIGHT_BG}`,
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
          background: isLight ? "rgba(252, 225, 210, 0.94)" : "rgba(20, 30, 56, 0.92)",
          borderBottom: isLight ? `1px solid ${MOXIE_BLUE}66` : `1px solid ${MOXIE_NIGHT_LINE}75`,
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
                value="repository"
                onChange={(_, value: string) => {
                  if (value === "dropDecks") {
                    navigate("/");
                  }
                }}
                variant="standard"
                sx={{
                  minHeight: 38,
                  "& .MuiTab-root": { color: isLight ? "#5f5180" : MOXIE_NIGHT_TEXT, minHeight: 38, py: 0, px: 1.8 },
                  "& .Mui-selected": { color: isLight ? MOXIE_BLUE : "#ffffff" },
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
                  borderColor: isLight ? `${MOXIE_BLUE}4d` : "rgba(130, 154, 217, 0.24)",
                  mx: 1.0,
                }}
              />

              <Tabs
                value={selectedWeightClass}
                onChange={(_, value: "Light" | "Medium" | "Heavy" | "Assault") => setSelectedWeightClass(value)}
                variant="standard"
                sx={{
                  minHeight: 38,
                  "& .MuiTab-root": { color: isLight ? "#5f5180" : MOXIE_NIGHT_TEXT, minHeight: 38, py: 0, px: 1.6 },
                  "& .Mui-selected": { color: isLight ? MOXIE_BLUE : "#ffffff" },
                }}
              >
                <Tab label="Lights" value="Light" />
                <Tab label="Mediums" value="Medium" />
                <Tab label="Heavies" value="Heavy" />
                <Tab label="Assaults" value="Assault" />
              </Tabs>
            </Stack>

            <Stack direction="row" spacing={1.35} sx={{ alignItems: "center", ml: "auto", flexWrap: "nowrap", justifyContent: "flex-end", flexShrink: 0 }}>
              {user && (
                <Typography sx={{ color: isLight ? "#556987" : MOXIE_NIGHT_TEXT, fontSize: "0.92rem", display: { xs: "none", sm: "block" } }}>
                  {user.username}
                </Typography>
              )}

              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setOpenAddBuild(true)}
                sx={{
                  background: isLight ? "rgba(58, 111, 189, 0.85)" : "rgba(127, 179, 255, 0.18)",
                  color: isLight ? "#fff" : "#7fb3ff",
                  textTransform: "none",
                  borderRadius: 0,
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
                  borderRadius: 0,
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
                  borderRadius: 0,
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
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2,
            border: isLight ? `1px solid ${MOXIE_BLUE}73` : `1px solid ${MOXIE_NIGHT_LINE}80`,
            background: isLight ? "rgba(252, 235, 224, 0.95)" : "rgba(23, 35, 66, 0.92)",
            overflow: "hidden",
            p: 2,
          }}
        >
          <Stack spacing={2}>
            {loading && <Alert severity="info">Loading mech repository...</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
            {!loading && (
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.2} sx={{ alignItems: { md: "center" } }}>
                <FormControl size="small" sx={{ minWidth: 130 }}>
                  <InputLabel>Tech</InputLabel>
                  <Select label="Tech" value={selectedTech} onChange={(event) => setSelectedTech(event.target.value as "All" | "IS" | "Clan")}>
                    <MenuItem value={TECH_ALL}>{TECH_ALL}</MenuItem>
                    <MenuItem value="IS">IS</MenuItem>
                    <MenuItem value="Clan">Clan</MenuItem>
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 130 }}>
                  <InputLabel>Tonnage</InputLabel>
                  <Select label="Tonnage" value={selectedTonnage} onChange={(event) => setSelectedTonnage(event.target.value)}>
                    <MenuItem value={FILTER_ALL}>{FILTER_ALL}</MenuItem>
                    {tonnageOptions.map((tonnage) => (
                      <MenuItem key={tonnage} value={String(tonnage)}>{`${tonnage}t`}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>Role</InputLabel>
                  <Select label="Role" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}>
                    <MenuItem value={FILTER_ALL}>{FILTER_ALL}</MenuItem>
                    {roleOptions.map((role) => (
                      <MenuItem key={role} value={role}>{role}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Submitter</InputLabel>
                  <Select label="Submitter" value={selectedSubmitter} onChange={(event) => setSelectedSubmitter(event.target.value)}>
                    <MenuItem value={TECH_ALL}>{TECH_ALL}</MenuItem>
                    {submitterOptions.map((username) => (
                      <MenuItem key={username} value={username}>{username}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  size="small"
                  label="Weaponry Search"
                  value={weaponrySearch}
                  onChange={(event) => setWeaponrySearch(event.target.value)}
                  sx={{ minWidth: { xs: "100%", md: 280 } }}
                  placeholder="e.g. gauss, lrm, ppc"
                />
              </Stack>
            )}
            {!loading && filteredHierarchy.length > 0 && (
              <Stack spacing={2}>
                {filteredHierarchy.map((weightClass) => (
                  <Stack key={weightClass.class} spacing={1.4}>
                    <Typography variant="h6" sx={{ color: isLight ? "#2f3f59" : MOXIE_NIGHT_TEXT }}>
                      {weightClass.class} ({weightClass.buildCount})
                    </Typography>
                    {weightClass.chassis.map((chassis) => {
                      const chassisBuildDocs = chassis.variants
                        .flatMap((variantEntry) => variantEntry.builds)
                        .map((build) => mechsById[build.id])
                        .filter((mech): mech is MechDoc => Boolean(mech));
                      const chassisTechs = Array.from(new Set(chassisBuildDocs.map((mech) => (mech.tech ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
                      const chassisTonnages = Array.from(
                        new Set(chassisBuildDocs.map((mech) => Number(mech.tonnage)).filter((tonnage) => Number.isFinite(tonnage) && tonnage > 0)),
                      ).sort((a, b) => a - b);
                      const chassisTechLabel = chassisTechs.length ? chassisTechs.join(" / ") : "-";
                      const chassisTonnageLabel = chassisTonnages.length ? chassisTonnages.map((tonnage) => `${tonnage}t`).join(" / ") : "-";

                      return (
                        <Paper
                          key={`${weightClass.class}-${chassis.chassis}`}
                          variant="outlined"
                          sx={{
                            p: 1.25,
                            borderColor: isLight ? `${MOXIE_BLUE}70` : `${MOXIE_NIGHT_LINE}90`,
                            borderWidth: "1px 0 0 0",
                            background: isLight ? "rgba(252, 236, 223, 0.72)" : "rgba(21, 33, 62, 0.72)",
                          }}
                        >
                          <Stack direction={{ xs: "column", md: "row" }} spacing={0.8} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
                            <Typography sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                              {chassis.chassis} ({chassis.buildCount})
                            </Typography>
                            <Stack direction="row" spacing={0.6} sx={{ flexWrap: "wrap" }}>
                              <Box sx={{ px: 0.8, py: 0.2, borderRadius: 0, border: isLight ? `1px solid ${MOXIE_BLUE}66` : `1px solid ${MOXIE_NIGHT_LINE}88`, background: isLight ? "rgba(248, 228, 214, 0.5)" : "rgba(22, 35, 67, 0.7)" }}>
                                <Typography variant="caption" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
                                  Tech: {chassisTechLabel}
                                </Typography>
                              </Box>
                              <Box sx={{ px: 0.8, py: 0.2, borderRadius: 0, border: isLight ? `1px solid ${MOXIE_BLUE}66` : `1px solid ${MOXIE_NIGHT_LINE}88`, background: isLight ? "rgba(248, 228, 214, 0.5)" : "rgba(22, 35, 67, 0.7)" }}>
                                <Typography variant="caption" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
                                  Tonnage: {chassisTonnageLabel}
                                </Typography>
                              </Box>
                            </Stack>
                          </Stack>
                        <Box
                          sx={{
                            mt: 1,
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                            gap: 1,
                          }}
                        >
                          {chassis.variants.flatMap((variant) =>
                            variant.builds.map((build) => {
                              const sourceBuild = mechsById[build.id];
                              const equipment = sourceBuild?.equipment ?? sourceBuild?.metadata?.equipment ?? [];
                              const buildCodes = getDisplayBuildCodes(sourceBuild?.buildCodes);
                              const descriptionValue = descriptionDrafts[build.id] ?? sourceBuild?.description ?? "";
                              const canonicalUrl = sourceBuild?.buildUrl ?? sourceBuild?.link ?? "";
                              const title = (sourceBuild?.variant ?? variant.variant).trim() || variant.variant;

                              return (
                                <Paper
                                  key={build.id}
                                  id={`repo-mech-${build.id}`}
                                  variant="outlined"
                                  sx={{
                                    p: { xs: 1.2, md: 1.5 },
                                    borderColor: isLight ? `${MOXIE_BLUE}88` : `${MOXIE_NIGHT_LINE}88`,
                                    borderWidth: "1px 0 0 0",
                                    background:
                                      highlightedMechId === build.id
                                        ? isLight
                                          ? "linear-gradient(145deg, rgba(255, 194, 170, 0.92), rgba(251, 181, 155, 0.94))"
                                          : "linear-gradient(145deg, rgba(47, 79, 150, 0.35), rgba(34, 54, 101, 0.7))"
                                        : isLight
                                          ? `linear-gradient(160deg, ${MOXIE_PAPER_SOFT}, ${MOXIE_PAPER})`
                                          : "rgba(26, 36, 66, 0.95)",
                                    boxShadow:
                                      highlightedMechId === build.id
                                        ? isLight
                                          ? `0 0 0 2px ${MOXIE_BLUE}55`
                                          : `0 0 0 2px ${MOXIE_NIGHT_LINE}77`
                                        : isLight
                                          ? "0 10px 24px rgba(53, 79, 132, 0.14)"
                                          : "0 10px 24px rgba(3, 7, 20, 0.4)",
                                    transition: "background 220ms ease, box-shadow 220ms ease",
                                    overflow: "hidden",
                                    "& a": {
                                      color: isLight ? "#b01859" : "#ff8ac5",
                                      fontWeight: 700,
                                      textDecorationColor: isLight ? "#b01859" : "#ff8ac5",
                                    },
                                    "& a:hover": {
                                      color: isLight ? "#8c0f47" : "#ffc1df",
                                    },
                                  }}
                                >
                                  <Stack spacing={1.15}>
                                    <Stack direction={{ xs: "column", md: "row" }} spacing={0.8} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
                                      <Typography sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 600, fontSize: { xs: "0.9rem", md: "0.98rem" } }}>
                                        {title}
                                      </Typography>
                                      <Stack direction="row" spacing={0.6} sx={{ flexWrap: "wrap" }}>
                                        <Box sx={{ px: 0.8, py: 0.2, borderRadius: 0, border: isLight ? `1px solid ${MOXIE_BLUE}66` : `1px solid ${MOXIE_NIGHT_LINE}88`, background: isLight ? "rgba(248, 228, 214, 0.5)" : "rgba(22, 35, 67, 0.7)" }}>
                                          <Typography variant="caption" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>{sourceBuild?.role ?? "No Role"}</Typography>
                                        </Box>
                                      </Stack>
                                    </Stack>

                                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: { xs: 1, md: 1.5 } }}>
                                      <Box>
                                        <Typography variant="caption" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontWeight: 700, fontFamily: MOXIE_INK_FONT, textTransform: "uppercase", letterSpacing: "0.14em" }}>
                                          Description
                                        </Typography>
                                        {editMode === "edit" && canManageBuilds ? (
                                          <TextField
                                            multiline
                                            minRows={5}
                                            fullWidth
                                            size="small"
                                            value={descriptionValue}
                                            onChange={(event) => {
                                              const next = event.target.value;
                                              setDescriptionDrafts((previous) => ({
                                                ...previous,
                                                [build.id]: next,
                                              }));
                                            }}
                                            sx={{ mt: 0.7 }}
                                          />
                                        ) : (
                                          <Typography sx={{ mt: 0.65, color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT, whiteSpace: "pre-wrap" }}>
                                            {descriptionValue.trim() || "No description provided."}
                                          </Typography>
                                        )}
                                      </Box>

                                      <Box>
                                        <Typography variant="caption" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontWeight: 700, fontFamily: MOXIE_INK_FONT, textTransform: "uppercase", letterSpacing: "0.14em" }}>
                                          Weaponry
                                        </Typography>
                                        <Typography sx={{ mt: 0.65, color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT, whiteSpace: "pre-wrap" }}>
                                          {(sourceBuild?.weaponry ?? "").trim() || "Not specified."}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontWeight: 700, fontFamily: MOXIE_INK_FONT, textTransform: "uppercase", letterSpacing: "0.14em" }}>
                                          Codes
                                        </Typography>
                                        <Stack spacing={0.4} sx={{ mt: 0.65 }}>
                                          <Typography variant="body2" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT }}>
                                            Skill Code: {(sourceBuild?.skillCode ?? "").trim() || "-"}
                                          </Typography>
                                          {buildCodes.length ? (
                                            buildCodes.map(([codeType, codeValue]) => (
                                              <Typography key={codeType} variant="body2" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT, overflowWrap: "anywhere" }}>
                                                {codeType}: {codeValue}
                                              </Typography>
                                            ))
                                          ) : (
                                            <Typography variant="body2" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT }}>
                                              No build codes listed.
                                            </Typography>
                                          )}
                                        </Stack>
                                      </Box>
                                    </Box>

                                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: { xs: 1, md: 1.5 } }}>
                                      <Box>
                                        <Typography variant="caption" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontWeight: 700, fontFamily: MOXIE_INK_FONT, textTransform: "uppercase", letterSpacing: "0.14em" }}>
                                          Equipment
                                        </Typography>
                                        {equipment.length ? (
                                          <Box component="ul" sx={{ mt: 0.65, mb: 0, pl: 2, color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT }}>
                                            {equipment.map((item) => (
                                              <Typography component="li" key={item} variant="body2" sx={{ fontFamily: MOXIE_INK_FONT, lineHeight: 1.4, overflowWrap: "anywhere" }}>
                                                {item}
                                              </Typography>
                                            ))}
                                          </Box>
                                        ) : (
                                          <Typography sx={{ mt: 0.65, color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT }}>
                                            No equipment listed.
                                          </Typography>
                                        )}
                                      </Box>

                                      <Box>
                                        <Typography variant="caption" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontWeight: 700, fontFamily: MOXIE_INK_FONT, textTransform: "uppercase", letterSpacing: "0.14em" }}>
                                          Source
                                        </Typography>
                                        <Stack spacing={0.45} sx={{ mt: 0.65 }}>
                                          <Typography variant="body2" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT }}>
                                            Submitted By: {(sourceBuild?.submittedBy ?? "").trim() || "-"}
                                          </Typography>
                                          {canonicalUrl ? (
                                            <Typography variant="body2" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT, overflowWrap: "anywhere" }}>
                                              Link: <a href={canonicalUrl} target="_blank" rel="noopener noreferrer">Open NAV build</a>
                                            </Typography>
                                          ) : (
                                            <Typography variant="body2" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT }}>
                                              Link: -
                                            </Typography>
                                          )}
                                        </Stack>
                                        {buildCodes.length > 1 && (
                                          <Stack spacing={0.45} sx={{ mt: 0.65 }}>
                                            <Typography variant="caption" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT, textTransform: "uppercase", letterSpacing: "0.14em" }}>
                                              Variants
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: isLight ? MOXIE_BLUE : MOXIE_NIGHT_TEXT, fontFamily: MOXIE_INK_FONT }}>
                                              Multiple non-duplicate code values are available in Codes.
                                            </Typography>
                                          </Stack>
                                        )}
                                      </Box>
                                    </Box>

                                    {editMode === "edit" && (
                                      <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                                        {canManageBuilds ? (
                                          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                                            <Button
                                              variant="outlined"
                                              size="small"
                                              disabled={parsingMechId === build.id || savingMechId === build.id}
                                              onClick={() => {
                                                void handleReparseBuild(build.id);
                                              }}
                                            >
                                              {parsingMechId === build.id ? "Re-parsing..." : "Re-run parser"}
                                            </Button>
                                            <Button
                                              variant="contained"
                                              size="small"
                                              startIcon={<SaveIcon fontSize="small" />}
                                              disabled={savingMechId === build.id}
                                              onClick={() => {
                                                void handleSaveBuild(build.id);
                                              }}
                                            >
                                              {savingMechId === build.id ? "Saving..." : "Save Build"}
                                            </Button>
                                          </Stack>
                                        ) : (
                                          <Box />
                                        )}
                                        {(() => {
                                          if (!sourceBuild || !canDeleteBuild(sourceBuild)) return null;
                                          return (
                                            <IconButton
                                              color="error"
                                              size="small"
                                              disabled={deletingMechId === build.id}
                                              onClick={() => {
                                                void handleDeleteMech(build.id);
                                              }}
                                              aria-label="Delete mech"
                                            >
                                              <DeleteIcon fontSize="small" />
                                            </IconButton>
                                          );
                                        })()}
                                      </Stack>
                                    )}
                                  </Stack>
                                </Paper>
                              );
                            }),
                          )}
                        </Box>
                        </Paper>
                      );
                    })}
                  </Stack>
                ))}
              </Stack>
            )}
            {!loading && !error && filteredHierarchy.length === 0 && (
              <Alert severity="info">No builds found in {selectedWeightClass}s.</Alert>
            )}
          </Stack>
        </Paper>
      </Container>

      <AddBuildDialog
        open={openAddBuild}
        onClose={() => setOpenAddBuild(false)}
        onBuildCreated={() => {
          void loadHierarchy();
        }}
        mode={mode}
      />

      <Dialog open={Boolean(parserReview)} onClose={() => setParserReview(null)} maxWidth="lg" fullWidth>
        <DialogTitle>Review re-parsed build</DialogTitle>
        <DialogContent dividers>
          {parserReview && (
            <Stack spacing={2}>
              <Alert severity="info">
                Re-ran the parser against this build’s source URL. Review the changed fields below before applying the newer version.
              </Alert>
              <Typography variant="body2" sx={{ color: isLight ? "#556887" : MOXIE_NIGHT_TEXT }}>
                Source: {parserReview.sourceUrl}
              </Typography>
              {parserReview.differences.length === 0 ? (
                <Alert severity="success">The re-parsed build did not change any tracked fields.</Alert>
              ) : (
                <Stack spacing={1}>
                  {parserReview.differences.map((difference) => (
                    <Paper
                      key={difference.label}
                      variant="outlined"
                      sx={{
                        p: 1.25,
                        background: isLight ? "rgba(255,255,255,0.72)" : "rgba(8,14,28,0.72)",
                      }}
                    >
                      <Typography sx={{ fontWeight: 700, mb: 0.5 }}>{difference.label}</Typography>
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1 }}>
                        <Stack spacing={0.4}>
                          <Typography variant="caption" sx={{ color: isLight ? "#556887" : MOXIE_NIGHT_TEXT }}>Current</Typography>
                          <Typography component="pre" sx={{ m: 0, whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "0.82rem" }}>
                            {formatReviewValue(difference.currentValue)}
                          </Typography>
                        </Stack>
                        <Stack spacing={0.4}>
                          <Typography variant="caption" sx={{ color: isLight ? "#556887" : MOXIE_NIGHT_TEXT }}>Parsed</Typography>
                          <Typography component="pre" sx={{ m: 0, whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: "0.82rem" }}>
                            {formatReviewValue(difference.nextValue)}
                          </Typography>
                        </Stack>
                      </Box>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setParserReview(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => void applyParsedMarkdown()} disabled={!parserReview || savingMechId === parserReview.mechId}>
            Apply newer parser version
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
