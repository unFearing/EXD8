import { Stack, Alert, Box, Button } from "@mui/material";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { WeightClassSummary } from "../types/contracts";

type RepositoryViewProps = {
  hierarchy: WeightClassSummary[];
  loading: boolean;
  error: string;
  onAddBuild: () => void;
  mode: "light" | "dark";
};

export function RepositoryView({
  hierarchy,
  loading,
  error,
  onAddBuild,
  mode,
}: RepositoryViewProps) {
  const isLight = mode === "light";

  // Build the markdown lines
  const lines: string[] = [];
  
  hierarchy.forEach((weightClass) => {
    lines.push(`## ${weightClass.class} (${weightClass.buildCount})`);
    lines.push("");
    
    weightClass.chassis.forEach((chassis) => {
      lines.push(`### ${chassis.chassis} (${chassis.buildCount})`);
      lines.push("");
      
      chassis.variants.forEach((variant) => {
        lines.push(`#### ${variant.variant} (${variant.buildCount} build${variant.buildCount === 1 ? "" : "s"})`);
        lines.push("");
        
        variant.builds.forEach((build) => {
          lines.push(build.markdown);
          lines.push("");
        });
      });
    });
  });

  const markdownText = lines.join("\n");

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        <Button variant="contained" onClick={onAddBuild}>
          + Add a Build
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {loading && <Alert severity="info">Loading mech documents...</Alert>}
      {!loading && !hierarchy.length && !error && (
        <Alert severity="info">No mech documents found in Cosmos yet.</Alert>
      )}

      {!loading && hierarchy.length > 0 && (
        <Box
          sx={{
            p: 2,
            borderRadius: 1.5,
            border: isLight ? "1px solid rgba(114, 133, 162, 0.3)" : "1px solid rgba(130, 154, 217, 0.25)",
            background: isLight ? "rgba(245, 249, 253, 0.92)" : "rgba(16, 27, 51, 0.78)",
            overflow: "auto",
            maxHeight: "70vh",
            minHeight: "300px",
          }}
        >
          <Box
            sx={{
              m: 0,
              p: 0,
              wordBreak: "break-word",
              color: isLight ? "#30425f" : "#dce4ff",
              "& h2": { fontSize: "1rem", mt: 1.6, mb: 0.8, fontWeight: 800 },
              "& h3": { fontSize: "0.92rem", mt: 1.3, mb: 0.6, fontWeight: 750 },
              "& h4": { fontSize: "0.86rem", mt: 1.1, mb: 0.5, fontWeight: 700 },
              "& p": { my: 0.7, lineHeight: 1.6 },
              "& ul": { my: 0.6, pl: 2.5 },
              "& li": { my: 0.2 },
              "& code": {
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
                fontSize: "0.8rem",
              },
              "& pre": {
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
                fontSize: "0.8rem",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                background: isLight ? "rgba(255,255,255,0.65)" : "rgba(7, 13, 27, 0.6)",
                border: isLight ? "1px solid rgba(114, 133, 162, 0.18)" : "1px solid rgba(130, 154, 217, 0.18)",
                borderRadius: 1,
                p: 1,
              },
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownText}</ReactMarkdown>
          </Box>
        </Box>
      )}
    </Stack>
  );
}
