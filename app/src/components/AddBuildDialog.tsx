import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  TextField,
  Button,
  Alert,
  Box,
  FormControlLabel,
  Switch,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { parseMechBuild, createMech } from "../api/client";
import type { CreateMechInput } from "../types/contracts";

const ROLE_OPTIONS = ["Capper", "Striker", "Skirmisher", "Brawler", "Sniper", "Fire Support", "Juggernaut"];

function defaultBuildDraft(): CreateMechInput {
  return {
    chassis: "",
    variant: "",
    codename: "",
    link: "",
    weaponry: "",
    description: "",
    role: "Skirmisher",
    buildCodes: {},
    skillCode: "pending",
    metadata: {
      equipment: [],
      ranges: {
        optimal: 0,
        max: 0,
        idealMin: 0,
        idealMax: 0,
      },
      heat: {
        generation: 0,
        capacity: 0,
        dissipation: 0,
      },
      dps: {
        sustained: 0,
        max: 0,
      },
    },
    class: "Medium",
    tech: "IS",
    tonnage: 50,
    buildUrl: "",
    equipment: [],
    primaryRangeBracket: [0, 0],
    optimalRange: 0,
    maxRange: 0,
  };
}

function parseListText(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToText(items: string[]): string {
  return items.join("\n");
}

function buildCodesToText(codes: Record<string, string>): string {
  return Object.entries(codes)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function parseBuildCodesText(value: string): Record<string, string> {
  const pairs = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return null;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (!key || !val) return null;
      return [key, val] as const;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null);

  return Object.fromEntries(pairs);
}

type AddBuildDialogProps = {
  open: boolean;
  onClose: () => void;
  onBuildCreated: () => void;
  mode: "light" | "dark";
};

type BulkReviewState = {
  links: string[];
  currentIndex: number;
  parsedBuilds: Array<{
    link: string;
    draft: CreateMechInput;
    notes: string;
    warnings: string[];
  }>;
  submitted: number;
};

export function AddBuildDialog({ open, onClose, onBuildCreated, mode }: AddBuildDialogProps) {
  const isLight = mode === "light";
  
  const [useManual, setUseManual] = useState(false);
  const [useBulk, setUseBulk] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [reviewBeforeSubmit, setReviewBeforeSubmit] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(false);
  
  const [bulkReview, setBulkReview] = useState<BulkReviewState | null>(null);
  const [buildNotes, setBuildNotes] = useState("");

  const [buildDraft, setBuildDraft] = useState<CreateMechInput>(defaultBuildDraft());
  const [buildCodeText, setBuildCodeText] = useState("");
  const [exportCodeText, setExportCodeText] = useState("");
  const [equipmentText, setEquipmentText] = useState("");
  const [buildMeta, setBuildMeta] = useState<Record<string, string | number | boolean | null>>({});

  const handleParse = async () => {
    if (!urlInput.trim()) return;

    setParsing(true);
    setError("");
    setNotice("");
    setWarnings([]);

    try {
      const parsed = await parseMechBuild(urlInput.trim());
      setBuildDraft(parsed.draft);
      setBuildCodeText(buildCodesToText(parsed.draft.buildCodes));
      setExportCodeText(parsed.draft.buildCodes.export ?? "");
      setEquipmentText(listToText(parsed.draft.metadata.equipment ?? parsed.draft.equipment ?? []));
      setWarnings(parsed.warnings);
      setBuildMeta(parsed.metadata);
      setExpanded(true);
      setNotice("Build link parsed. Review fields and save.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to parse build link");
    } finally {
      setParsing(false);
    }
  };

  const handleParseBulk = async () => {
    if (!bulkInput.trim()) return;

    setParsing(true);
    setError("");
    setNotice("");

    try {
      const links = parseListText(bulkInput);
      if (links.length === 0) {
        setError("No valid links found");
        setParsing(false);
        return;
      }

      const parsedBuilds: BulkReviewState["parsedBuilds"] = [];
      let parseErrors = 0;

      for (const link of links) {
        try {
          const parsed = await parseMechBuild(link);
          parsedBuilds.push({
            link,
            draft: parsed.draft,
            notes: "",
            warnings: parsed.warnings,
          });
        } catch (err) {
          parseErrors++;
          console.warn(`Failed to parse ${link}:`, err);
        }
      }

      if (parsedBuilds.length === 0) {
        setError(`Failed to parse all ${links.length} links. Check console for details.`);
        setParsing(false);
        return;
      }

      if (parseErrors > 0) {
        setNotice(`Parsed ${parsedBuilds.length} / ${links.length} builds (${parseErrors} failed)`);
      }

      if (reviewBeforeSubmit) {
        setBulkReview({
          links,
          currentIndex: 0,
          parsedBuilds,
          submitted: 0,
        });
      } else {
        // Direct submit all
        const result = await submitBulkBuilds(parsedBuilds);
        if (result.failureCount === 0) {
          handleClose();
          onBuildCreated();
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to parse bulk links");
    } finally {
      setParsing(false);
    }
  };

  const submitBulkBuilds = async (builds: BulkReviewState["parsedBuilds"]) => {
    setSaving(true);
    setError("");
    let successCount = 0;
    let failureCount = 0;
    let duplicateCount = 0;

    for (const build of builds) {
      try {
        const payload: CreateMechInput = {
          ...build.draft,
          metadata: {
            ...build.draft.metadata,
            equipment: build.draft.metadata.equipment,
          },
          description: build.notes
            ? `${build.draft.description}\n\n--- Review Notes ---\n${build.notes}`
            : build.draft.description,
        };
        await createMech(payload);
        successCount++;
      } catch (err: unknown) {
        console.error(`Failed to save ${build.draft.chassis}-${build.draft.variant}:`, err);
        const maybeError = err as { code?: string; message?: string };
        if (maybeError.code === "WRITE_CONFLICT" || /already exists/i.test(maybeError.message ?? "")) {
          duplicateCount++;
        }
        failureCount++;
      }
    }

    setSaving(false);
    if (failureCount === 0) {
      setNotice(`Successfully created ${successCount} build(s).`);
    } else {
      if (duplicateCount > 0) {
        setError(
          `Created ${successCount} build(s). Rejected ${duplicateCount} duplicate link(s)${
            failureCount - duplicateCount > 0 ? `, plus ${failureCount - duplicateCount} other failure(s)` : ""
          }.`
        );
      } else {
        setError(`Created ${successCount} build(s), but ${failureCount} failed. Check console.`);
      }
    }

    return { successCount, failureCount, duplicateCount };
  };

  const handleBulkReviewNext = async () => {
    if (!bulkReview) return;

    const current = bulkReview.parsedBuilds[bulkReview.currentIndex];
    if (!current) return;

    // Save notes if any
    if (buildNotes.trim()) {
      current.notes = buildNotes;
    }

    if (bulkReview.currentIndex === bulkReview.parsedBuilds.length - 1) {
      // Last build - submit all
      setSaving(true);
      try {
        const result = await submitBulkBuilds(bulkReview.parsedBuilds);
        if (result.failureCount === 0) {
          handleClose();
          onBuildCreated();
        }
      } finally {
        setSaving(false);
      }
    } else {
      // Move to next build
      setBulkReview((prev) =>
        prev
          ? {
              ...prev,
              currentIndex: prev.currentIndex + 1,
            }
          : null
      );
      setBuildNotes("");
    }
  };

  const handleBulkReviewSkip = () => {
    if (!bulkReview) return;

    if (bulkReview.currentIndex === bulkReview.parsedBuilds.length - 1) {
      // Last build - submit all
      setSaving(true);
      submitBulkBuilds(bulkReview.parsedBuilds)
        .then((result) => {
          if (result.failureCount === 0) {
            handleClose();
            onBuildCreated();
          }
        })
        .finally(() => setSaving(false));
    } else {
      // Move to next build
      setBulkReview((prev) =>
        prev
          ? {
              ...prev,
              currentIndex: prev.currentIndex + 1,
            }
          : null
      );
      setBuildNotes("");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const payload: CreateMechInput = {
        ...buildDraft,
        metadata: {
          ...buildDraft.metadata,
          equipment: parseListText(equipmentText),
        },
        equipment: parseListText(equipmentText),
        buildCodes: {
          ...parseBuildCodesText(buildCodeText),
          ...(exportCodeText.trim() ? { export: exportCodeText.trim() } : {}),
        },
      };
      await createMech(payload);
      setNotice(`Build created for ${payload.chassis}-${payload.variant}.`);
      
      setTimeout(() => {
        handleClose();
        onBuildCreated();
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create build");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setUrlInput("");
    setBulkInput("");
    setUseManual(false);
    setUseBulk(false);
    setReviewBeforeSubmit(false);
    setBuildDraft(defaultBuildDraft());
    setBuildCodeText("");
    setExportCodeText("");
    setEquipmentText("");
    setBuildMeta({});
    setError("");
    setWarnings([]);
    setNotice("");
    setExpanded(false);
    setBulkReview(null);
    setBuildNotes("");
    onClose();
  };

  const isFormValid =
    buildDraft.chassis &&
    buildDraft.variant &&
    buildDraft.tonnage &&
    buildDraft.weaponry;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add a Build</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {/* Bulk Review Flow */}
          {bulkReview && (
            <Stack spacing={2}>
              <Alert severity="info">
                Reviewing build {bulkReview.currentIndex + 1} of {bulkReview.parsedBuilds.length}
              </Alert>

              {(() => {
                const current = bulkReview.parsedBuilds[bulkReview.currentIndex];
                return (
                  <Stack spacing={1.5}>
                    <Box sx={{ p: 1.5, background: isLight ? "rgba(230, 237, 246, 0.5)" : "rgba(9, 16, 35, 0.5)", borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                        {current.draft.chassis}-{current.draft.variant}
                      </Typography>
                      <Typography variant="caption" sx={{ color: isLight ? "#627a9f" : "#9fb6e8", display: "block", mb: 1 }}>
                        Role: {current.draft.role} | Tonnage: {current.draft.tonnage}
                      </Typography>
                      {current.warnings.length > 0 && (
                        <Stack spacing={0.5}>
                          {current.warnings.map((w, idx) => (
                            <Alert key={idx} severity="warning" sx={{ py: 0.5 }}>
                              {w}
                            </Alert>
                          ))}
                        </Stack>
                      )}
                    </Box>

                    <TextField
                      label="Add Optional Notes"
                      multiline
                      minRows={3}
                      size="small"
                      fullWidth
                      placeholder="Any notes to append to the description (optional)..."
                      value={buildNotes}
                      onChange={(e) => setBuildNotes(e.target.value)}
                      helperText="These notes will be appended to the build description"
                    />
                  </Stack>
                );
              })()}

              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          )}

          {/* Single Build Input Section */}
          {!bulkReview && !expanded && (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1}>
                <FormControlLabel
                  control={<Switch checked={useManual} onChange={(e) => {
                    setUseManual(e.target.checked);
                    if (e.target.checked) {
                      setUseBulk(false);
                      setExpanded(true);
                    }
                  }} />}
                  label="Manual Input"
                />
                <FormControlLabel
                  control={<Switch checked={useBulk} onChange={(e) => {
                    setUseBulk(e.target.checked);
                    if (e.target.checked) {
                      setUseManual(false);
                    }
                  }} />}
                  label="Bulk Import"
                />
              </Stack>

              {useBulk && (
                <Stack spacing={1}>
                  <TextField
                    label="Build Links (Bulk)"
                    multiline
                    minRows={3}
                    fullWidth
                    size="small"
                    value={bulkInput}
                    onChange={(e) => setBulkInput(e.target.value)}
                    placeholder="Paste one link per line, or comma-separated&#10;https://mwo.nav-alpha.com/mechlab?b=..."
                  />
                  <FormControlLabel
                    control={<Switch checked={reviewBeforeSubmit} onChange={(e) => setReviewBeforeSubmit(e.target.checked)} />}
                    label="Review each before submit"
                  />
                  {error && <Alert severity="error">{error}</Alert>}
                </Stack>
              )}

              {!useBulk && !useManual && (
                <Stack direction="row" spacing={1}>
                  <TextField
                    label="Mwo.nav-alpha Build Link"
                    size="small"
                    fullWidth
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://mwo.nav-alpha.com/mechlab?b=..."
                  />
                  <Button
                    variant="contained"
                    disabled={parsing || !urlInput.trim()}
                    onClick={handleParse}
                  >
                    {parsing ? "..." : "Parse"}
                  </Button>
                </Stack>
              )}

              {error && !useBulk && <Alert severity="error">{error}</Alert>}
            </Stack>
          )}

          {/* Expanded Single Build Form Section */}
          {!bulkReview && expanded && (
            <Stack spacing={1.5}>
              {notice && <Alert severity="success">{notice}</Alert>}
              {error && <Alert severity="error">{error}</Alert>}
              {warnings.map((warning, idx) => (
                <Alert key={idx} severity="warning">{warning}</Alert>
              ))}

              <Stack direction="row" spacing={1}>
                <TextField
                  label="Chassis"
                  size="small"
                  fullWidth
                  value={buildDraft.chassis}
                  onChange={(e) => setBuildDraft((prev) => ({ ...prev, chassis: e.target.value, codename: `${e.target.value}-${prev.variant}` }))}
                />
                <TextField
                  label="Variant"
                  size="small"
                  fullWidth
                  value={buildDraft.variant}
                  onChange={(e) => setBuildDraft((prev) => ({ ...prev, variant: e.target.value, codename: `${prev.chassis}-${e.target.value}` }))}
                />
                <TextField
                  label="Tonnage"
                  type="number"
                  size="small"
                  value={buildDraft.tonnage}
                  onChange={(e) => setBuildDraft((prev) => ({ ...prev, tonnage: Number(e.target.value) || 0 }))}
                />
              </Stack>

              <Stack direction="row" spacing={1}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Class</InputLabel>
                  <Select
                    label="Class"
                    value={buildDraft.class}
                    onChange={(e) =>
                      setBuildDraft((prev) => ({ ...prev, class: e.target.value as CreateMechInput["class"] }))
                    }
                  >
                    {["Light", "Medium", "Heavy", "Assault"].map((wc) => (
                      <MenuItem key={wc} value={wc}>
                        {wc}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" fullWidth>
                  <InputLabel>Tech</InputLabel>
                  <Select
                    label="Tech"
                    value={buildDraft.tech}
                    onChange={(e) =>
                      setBuildDraft((prev) => ({ ...prev, tech: e.target.value as CreateMechInput["tech"] }))
                    }
                  >
                    <MenuItem value="IS">IS</MenuItem>
                    <MenuItem value="Clan">Clan</MenuItem>
                  </Select>
                </FormControl>

                <FormControl size="small" fullWidth>
                  <InputLabel>Role</InputLabel>
                  <Select
                    label="Role"
                    value={buildDraft.role}
                    onChange={(e) => setBuildDraft((prev) => ({ ...prev, role: e.target.value }))}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <MenuItem key={role} value={role}>
                        {role}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>

              <TextField
                label="Weaponry (critical)"
                multiline
                minRows={2}
                size="small"
                value={buildDraft.weaponry}
                onChange={(e) => setBuildDraft((prev) => ({ ...prev, weaponry: e.target.value }))}
              />

              <TextField
                label="Equipment"
                multiline
                minRows={1}
                size="small"
                value={equipmentText}
                onChange={(e) => {
                  const value = e.target.value;
                  setEquipmentText(value);
                    setBuildDraft((prev) => ({
                      ...prev,
                      equipment: parseListText(value),
                      metadata: {
                        ...prev.metadata,
                        equipment: parseListText(value),
                      },
                    }));
                }}
              />

              <Accordion disableGutters elevation={0} sx={{ background: "transparent" }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 34, px: 0 }}>
                  <Typography sx={{ fontSize: "0.85rem", fontWeight: 700 }}>
                    Advanced Fields
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 0, pt: 0 }}>
                  <Stack spacing={1}>
                    <TextField
                      label="MWO Export Code"
                      multiline
                      minRows={2}
                      size="small"
                      value={exportCodeText}
                      onChange={(e) => setExportCodeText(e.target.value)}
                      helperText="In NAV-Alpha: click Export, then paste the MWO Build Code here"
                    />

                    <TextField
                      label="Build Codes"
                      multiline
                      minRows={2}
                      size="small"
                      value={buildCodeText}
                      onChange={(e) => {
                        const value = e.target.value;
                        setBuildCodeText(value);
                        setBuildDraft((prev) => ({ ...prev, buildCodes: parseBuildCodesText(value) }));
                      }}
                      helperText="key: value per line"
                    />

                    <Stack direction="row" spacing={1}>
                      <TextField
                        label="Skill Code"
                        size="small"
                        fullWidth
                        value={buildDraft.skillCode}
                        onChange={(e) => setBuildDraft((prev) => ({ ...prev, skillCode: e.target.value }))}
                      />
                      <TextField
                        label="Build URL"
                        size="small"
                        fullWidth
                        value={buildDraft.link || buildDraft.buildUrl || ""}
                        onChange={(e) => setBuildDraft((prev) => ({ ...prev, link: e.target.value, buildUrl: e.target.value }))}
                      />
                    </Stack>

                    <TextField
                      label="Description"
                      multiline
                      minRows={2}
                      size="small"
                      value={buildDraft.description}
                      onChange={(e) => setBuildDraft((prev) => ({ ...prev, description: e.target.value }))}
                    />

                    <Stack direction="row" spacing={1}>
                      <TextField
                        label="Range Min"
                        type="number"
                        size="small"
                        value={buildDraft.primaryRangeBracket?.[0] ?? 0}
                        onChange={(e) => {
                          const min = Number(e.target.value) || 0;
                          setBuildDraft((prev) => ({
                            ...prev,
                            primaryRangeBracket: [min, prev.primaryRangeBracket?.[1] ?? 0],
                          }));
                        }}
                      />
                      <TextField
                        label="Range Max"
                        type="number"
                        size="small"
                        value={buildDraft.primaryRangeBracket?.[1] ?? 0}
                        onChange={(e) => {
                          const max = Number(e.target.value) || 0;
                          setBuildDraft((prev) => ({
                            ...prev,
                            primaryRangeBracket: [prev.primaryRangeBracket?.[0] ?? 0, max],
                          }));
                        }}
                      />
                      <TextField
                        label="Optimal Range"
                        type="number"
                        size="small"
                        value={buildDraft.optimalRange ?? 0}
                        onChange={(e) => setBuildDraft((prev) => ({ ...prev, optimalRange: Number(e.target.value) || 0 }))}
                      />
                      <TextField
                        label="Max Range"
                        type="number"
                        size="small"
                        value={buildDraft.maxRange ?? 0}
                        onChange={(e) => setBuildDraft((prev) => ({ ...prev, maxRange: Number(e.target.value) || 0 }))}
                      />
                    </Stack>

                    {!!Object.keys(buildMeta).length && (
                      <Box
                        sx={{
                          borderRadius: 1,
                          px: 1,
                          py: 0.75,
                          maxHeight: 120,
                          overflowY: "auto",
                          background: isLight ? "rgba(230, 237, 246, 0.9)" : "rgba(9, 16, 35, 0.8)",
                          border: isLight ? "1px solid rgba(114, 133, 162, 0.2)" : "1px solid rgba(130, 154, 217, 0.2)",
                        }}
                      >
                        <Typography
                          component="pre"
                          sx={{ m: 0, whiteSpace: "pre-wrap", fontSize: "0.7rem", color: isLight ? "#3f5575" : "#c7d6f8" }}
                        >
                          {JSON.stringify(buildMeta, null, 2)}
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        {bulkReview ? (
          <>
            <Button
              disabled={saving}
              onClick={handleBulkReviewSkip}
            >
              Skip Notes
            </Button>
            <Button
              variant="contained"
              disabled={saving}
              onClick={handleBulkReviewNext}
            >
              {bulkReview.currentIndex === bulkReview.parsedBuilds.length - 1
                ? saving
                  ? "Submitting..."
                  : "Submit All"
                : "Next"}
            </Button>
          </>
        ) : expanded ? (
          <Button
            variant="contained"
            disabled={saving || !isFormValid}
            onClick={handleSave}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={
              useBulk
                ? parsing || !bulkInput.trim()
                : useManual
                  ? false
                  : parsing || !urlInput.trim()
            }
            onClick={useBulk ? handleParseBulk : useManual ? () => setExpanded(true) : handleParse}
          >
            {useBulk
              ? parsing
                ? "Parsing..."
                : `Parse ${parseListText(bulkInput).length || 0} Links`
              : useManual
                ? "Continue"
                : parsing
                  ? "Parsing..."
                  : "Parse"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
