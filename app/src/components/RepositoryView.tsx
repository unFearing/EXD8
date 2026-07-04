import { Stack, Alert, Box, Button, AppBar, Container, Paper, Tooltip, ButtonGroup, Tab, Tabs } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { WeightClassSummary } from "../types/contracts";
import { deleteMech, getMechHierarchy } from "../api/client";
import type { DiscordUser } from "../hooks/useDiscordAuth";
import { AddBuildDialog } from "./AddBuildDialog";

interface RepositoryViewProps {
  mode: "light" | "dark";
  onToggleMode: () => void;
  user: DiscordUser | null;
  onLogout: () => void;
  hasRole: (roleId: string) => boolean;
}

export function RepositoryView({
  mode,
  onToggleMode,
  user,
  onLogout,
  hasRole: _hasRole,
}: RepositoryViewProps) {
  const navigate = useNavigate();
  const isLight = mode === "light";
  const [hierarchy, setHierarchy] = useState<WeightClassSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openAddBuild, setOpenAddBuild] = useState(false);
  const [deletingMechId, setDeletingMechId] = useState<string | null>(null);
  const [selectedWeightClass, setSelectedWeightClass] = useState<"Light" | "Medium" | "Heavy" | "Assault">("Light");
  const canDelete = user?.appRole === "TL";

  const loadHierarchy = async () => {
    setLoading(true);
    try {
      const data = await getMechHierarchy();
      setHierarchy(data);
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

  const handleDeleteMech = async (id: string) => {
    if (!canDelete) {
      setError("Only TL can delete mechs.");
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
          errorMessage = "You don't have permission to delete mechs (TL role required)";
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

  const filteredHierarchy = hierarchy.filter((weightClass) => weightClass.class === selectedWeightClass);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: isLight
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
                value="repository"
                onChange={(_, value: string) => {
                  if (value === "dropDecks") {
                    navigate("/");
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

            <Stack direction="row" spacing={1.2} sx={{ alignItems: "center", ml: "auto", flexWrap: "wrap" }}>
              {user && (
                <Typography sx={{ color: isLight ? "#556987" : "#cbd6f6", fontSize: "0.9rem", display: { xs: "none", sm: "block" } }}>
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
                <Button variant="outlined" onClick={onLogout}>
                  Discord Logout
                </Button>
              </ButtonGroup>
            </Stack>
          </Stack>

          <Tabs
            value={selectedWeightClass}
            onChange={(_, value: "Light" | "Medium" | "Heavy" | "Assault") => setSelectedWeightClass(value)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 34,
              "& .MuiTab-root": { color: isLight ? "#566987" : "#cbd6f6", minHeight: 34, py: 0 },
              "& .Mui-selected": { color: isLight ? "#26364f" : "#ffffff" },
            }}
          >
            <Tab label="Lights" value="Light" />
            <Tab label="Mediums" value="Medium" />
            <Tab label="Heavies" value="Heavy" />
            <Tab label="Assaults" value="Assault" />
          </Tabs>
        </Box>
      </AppBar>

      <Container maxWidth={false} sx={{ pt: 2, px: { xs: 1, md: 2 } }}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2,
            border: isLight ? "1px solid rgba(114, 133, 162, 0.34)" : "1px solid rgba(130, 154, 217, 0.35)",
            background: isLight ? "rgba(235, 242, 249, 0.95)" : "rgba(11, 16, 33, 0.92)",
            overflow: "hidden",
            p: 2,
          }}
        >
          <Stack spacing={2}>
            {loading && <Alert severity="info">Loading mech repository...</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
            {!loading && filteredHierarchy.length > 0 && (
              <Stack spacing={2}>
                {filteredHierarchy.map((weightClass) => (
                  <Stack key={weightClass.class} spacing={1.4}>
                    <Typography variant="h6" sx={{ color: isLight ? "#2f3f59" : "#eff4ff" }}>
                      {weightClass.class} ({weightClass.buildCount})
                    </Typography>
                    {weightClass.chassis.map((chassis) => (
                      <Paper
                        key={`${weightClass.class}-${chassis.chassis}`}
                        variant="outlined"
                        sx={{
                          p: 1.25,
                          borderColor: isLight ? "rgba(114, 133, 162, 0.34)" : "rgba(130, 154, 217, 0.35)",
                          background: isLight ? "rgba(241, 246, 251, 0.75)" : "rgba(15, 24, 45, 0.65)",
                        }}
                      >
                        <Typography sx={{ color: isLight ? "#2f3f59" : "#eff4ff", fontWeight: 700 }}>
                          {chassis.chassis} ({chassis.buildCount})
                        </Typography>
                        <Stack spacing={1} sx={{ mt: 1 }}>
                          {chassis.variants.map((variant) => (
                            <Stack key={`${chassis.chassis}-${variant.variant}`} spacing={0.8}>
                              <Typography sx={{ color: isLight ? "#4f6282" : "#cbd6f6", fontWeight: 700 }}>
                                {variant.variant} ({variant.buildCount} build{variant.buildCount === 1 ? "" : "s"})
                              </Typography>
                              {variant.builds.map((build) => (
                                <Paper
                                  key={build.id}
                                  variant="outlined"
                                  sx={{
                                    p: 1,
                                    borderColor: isLight ? "rgba(114, 133, 162, 0.28)" : "rgba(130, 154, 217, 0.25)",
                                    background: isLight ? "rgba(255, 255, 255, 0.72)" : "rgba(8, 14, 28, 0.72)",
                                  }}
                                >
                                  <Stack spacing={1}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{build.markdown}</ReactMarkdown>
                                    {canDelete && (
                                      <Box>
                                        <Button
                                          variant="outlined"
                                          color="error"
                                          size="small"
                                          disabled={deletingMechId === build.id}
                                          onClick={() => {
                                            void handleDeleteMech(build.id);
                                          }}
                                        >
                                          Delete Mech
                                        </Button>
                                      </Box>
                                    )}
                                  </Stack>
                                </Paper>
                              ))}
                            </Stack>
                          ))}
                        </Stack>
                      </Paper>
                    ))}
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
    </Box>
  );
}
