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
  variants: VariantGroup[];
};

type VariantGroup = {
  variant: string;
  mechs: MechDoc[];
  buildCodes: string[];
};

export const MechSelector: React.FC<MechSelectorProps> = ({ selectedMechId, allMechs, onChange, disabled }) => {
  // Build hierarchy: Chassis → Variant → Mechs
  const chassisHierarchy = useMemo(() => {
    const groups = new Map<string, Map<string, MechDoc[]>>();

    allMechs.forEach((mech) => {
      if (!groups.has(mech.chassis)) {
        groups.set(mech.chassis, new Map());
      }
      const variantMap = groups.get(mech.chassis)!;
      if (!variantMap.has(mech.variant)) {
        variantMap.set(mech.variant, []);
      }
      variantMap.get(mech.variant)!.push(mech);
    });

    const result: ChassiGroup[] = [];
    groups.forEach((variantMap, chassis) => {
      const variants: VariantGroup[] = [];
      variantMap.forEach((mechs, variant) => {
        const buildCodes = mechs.flatMap((m) => Object.keys(m.buildCodes ?? {}));
        variants.push({
          variant,
          mechs,
          buildCodes: [...new Set(buildCodes)].sort(),
        });
      });
      result.push({
        chassis,
        variants: variants.sort((a, b) => a.variant.localeCompare(b.variant)),
      });
    });

    return result.sort((a, b) => a.chassis.localeCompare(b.chassis));
  }, [allMechs]);

  // Current selection state
  const selectedMech = useMemo(() => allMechs.find((m) => m.id === selectedMechId), [allMechs, selectedMechId]);
  const selectedChassis = selectedMech?.chassis ?? null;
  const selectedVariant = selectedMech?.variant ?? null;

  // Filtered options
  const availableChassisOptions = useMemo(() => chassisHierarchy.map((g) => g.chassis), [chassisHierarchy]);

  const availableVariantOptions = useMemo(() => {
    if (!selectedChassis) return [];
    const group = chassisHierarchy.find((g) => g.chassis === selectedChassis);
    return group?.variants.map((v) => v.variant) ?? [];
  }, [selectedChassis, chassisHierarchy]);

  const availableBuildCodes = useMemo(() => {
    if (!selectedChassis || !selectedVariant) return [];
    const group = chassisHierarchy.find((g) => g.chassis === selectedChassis);
    const variantGroup = group?.variants.find((v) => v.variant === selectedVariant);
    return variantGroup?.buildCodes ?? [];
  }, [selectedChassis, selectedVariant, chassisHierarchy]);

  const handleChassiChange = (newChassis: string) => {
    // Auto-select first variant when chassis changes
    const group = chassisHierarchy.find((g) => g.chassis === newChassis);
    const firstVariant = group?.variants[0];
    if (firstVariant && firstVariant.mechs.length > 0) {
      onChange(firstVariant.mechs[0].id);
    }
  };

  const handleVariantChange = (newVariant: string) => {
    if (!selectedChassis) return;
    const group = chassisHierarchy.find((g) => g.chassis === selectedChassis);
    const variantGroup = group?.variants.find((v) => v.variant === newVariant);
    if (variantGroup && variantGroup.mechs.length > 0) {
      onChange(variantGroup.mechs[0].id);
    }
  };

  return (
    <Stack spacing={1.5} sx={{ width: "100%" }}>
      {/* Chassis Selector */}
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.7 }}>
          Chassis
        </Typography>
        <FormControl fullWidth size="small" variant="standard">
          <Select
            value={selectedChassis ?? ""}
            onChange={(e) => handleChassiChange(e.target.value)}
            disabled={disabled || availableChassisOptions.length === 0}
            displayEmpty
          >
            <MenuItem value="">
              <em>Select Chassis</em>
            </MenuItem>
            {availableChassisOptions.map((chassis) => (
              <MenuItem key={chassis} value={chassis}>
                {chassis}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Variant Selector */}
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.7 }}>
          Variant
        </Typography>
        <FormControl fullWidth size="small" variant="standard" disabled={!selectedChassis}>
          <Select
            value={selectedVariant ?? ""}
            onChange={(e) => handleVariantChange(e.target.value)}
            disabled={disabled || !selectedChassis || availableVariantOptions.length === 0}
            displayEmpty
          >
            <MenuItem value="">
              <em>Select Variant</em>
            </MenuItem>
            {availableVariantOptions.map((variant) => (
              <MenuItem key={variant} value={variant}>
                {variant}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Loadout Display */}
      {availableBuildCodes.length > 0 && (
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.7 }}>
            Available Loadouts
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            {availableBuildCodes.join(", ")}
          </Typography>
        </Box>
      )}

      {/* Selected Mech Info */}
      {selectedMech && (
        <Box
          sx={{
            p: 1,
            borderRadius: 1,
            backgroundColor: "rgba(130, 154, 217, 0.1)",
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {selectedMech.tonnage}T | {selectedMech.class} | {selectedMech.role}
          </Typography>
        </Box>
      )}
    </Stack>
  );
};
