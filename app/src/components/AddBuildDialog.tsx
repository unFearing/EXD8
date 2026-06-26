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
    class: "Medium",
    tech: "IS",
    tonnage: 50,
    buildUrl: "",
    weaponry: "",
    equipment: [],
    description: "",
    role: "Skirmisher",
    buildCodes: {},
    skillCode: "pending",
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

export function AddBuildDialog({ open, onClose, onBuildCreated, mode }: AddBuildDialogProps) {
  const isLight = mode === "light";
  
  const [useManual, setUseManual] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(false);

  const [buildDraft, setBuildDraft] = useState<CreateMechInput>(defaultBuildDraft());
  const [buildCodeText, setBuildCodeText] = useState("");
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
      setEquipmentText(listToText(parsed.draft.equipment));
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

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const payload: CreateMechInput = {
        ...buildDraft,
        equipment: parseListText(equipmentText),
        buildCodes: parseBuildCodesText(buildCodeText),
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
    setUseManual(false);
    setBuildDraft(defaultBuildDraft());
    setBuildCodeText("");
    setEquipmentText("");
    setBuildMeta({});
    setError("");
    setWarnings([]);
    setNotice("");
    setExpanded(false);
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
          {/* Input Section */}
          {!expanded && (
            <Stack spacing={1.5}>
              <FormControlLabel
                control={<Switch checked={useManual} onChange={(e) => {
                  setUseManual(e.target.checked);
                  if (e.target.checked) {
                    setExpanded(true);
                  }
                }} />}
                label="Manual Input"
              />

              {!useManual && (
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

              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          )}

          {/* Expanded Form Section */}
          {expanded && (
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
                  onChange={(e) => setBuildDraft((prev) => ({ ...prev, chassis: e.target.value }))}
                />
                <TextField
                  label="Variant"
                  size="small"
                  fullWidth
                  value={buildDraft.variant}
                  onChange={(e) => setBuildDraft((prev) => ({ ...prev, variant: e.target.value }))}
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
                  setBuildDraft((prev) => ({ ...prev, equipment: parseListText(value) }));
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
                        value={buildDraft.buildUrl}
                        onChange={(e) => setBuildDraft((prev) => ({ ...prev, buildUrl: e.target.value }))}
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
        {expanded ? (
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
            disabled={useManual ? false : parsing || !urlInput.trim()}
            onClick={useManual ? () => setExpanded(true) : handleParse}
          >
            {useManual ? "Continue" : parsing ? "Parsing..." : "Parse"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
