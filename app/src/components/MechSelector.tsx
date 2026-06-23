import { useMemo } from "react";
import { Box, FormControl, MenuItem, Select, Stack, Typography } from "@mui/material";
import type { MechDoc } from "../types/contracts";

type MechSelectorProps = {
  selectedMechId: string | null;
  allMechs: MechDoc[];
  onChange: (mechId: string) => void;
  disabled: boolean;
};

type ChassiGroup = {
  chassis: string;
  variants: string[];
};

export const MechSelector: React.FC<MechSelectorProps> = ({ selectedMechId, allMechs, onChange, disabled }) => {
  // Build hierarchy: Chassis → Variant
  const chassisHierarchy = useMemo(() => {
    const groups = new Map<string, Set<string>>();

    allMechs.forEach((mech) => {
      if (!groups.has(mech.chassis)) {
        groups.set(mech.chassis, new Set());
      }
      groups.get(mech.chassis)!.add(mech.variant);
    });

    const result: ChassiGroup[] = [];
    groups.forEach((variantSet, chassis) => {
      result.push({
        chassis,
        variants: [...variantSet].sort((a, b) => a.localeCompare(b)),
      });
    });

    return result.sort((a, b) => a.chassis.localeCompare(b.chassis));
  }, [allMechs]);

  const options = useMemo(
    () =>
      chassisHierarchy.flatMap((group) => [
        { value: group.chassis, label: group.chassis },
        ...group.variants.map((variant) => ({
          value: `${group.chassis}-${variant}`,
          label: `${group.chassis}-${variant}`,
        })),
      ]),
    [chassisHierarchy],
  );

  const selectedOption = useMemo(() => {
    if (!selectedMechId) return "";
    if (options.some((option) => option.value === selectedMechId)) {
      return selectedMechId;
    }

    const selectedMech = allMechs.find((mech) => mech.id === selectedMechId);
    if (!selectedMech) return "";

    const variantOption = `${selectedMech.chassis}-${selectedMech.variant}`;
    if (options.some((option) => option.value === variantOption)) {
      return variantOption;
    }

    if (options.some((option) => option.value === selectedMech.chassis)) {
      return selectedMech.chassis;
    }

    return "";
  }, [allMechs, options, selectedMechId]);

  return (
    <Stack spacing={1} sx={{ width: "100%" }}>
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.7 }}>
          Mech
        </Typography>
        <FormControl fullWidth size="small" variant="standard">
          <Select
            value={selectedOption}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || options.length === 0}
            displayEmpty
          >
            <MenuItem value="">
              <em>Select chassis or chassis-variant</em>
            </MenuItem>
            {options.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
    </Stack>
  );
};
