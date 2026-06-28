import { useMemo } from "react";
import { FormControl, MenuItem, Select, Stack } from "@mui/material";
import type { ConfigMech, SelectorSource } from "../types/contracts";

type MechSelectorProps = {
  selectedMechId: string;
  selectedChassis: string;
  selectedVariant: string;
  allConfiguredMechs: ConfigMech[];
  repositoryMechs: ConfigMech[];
  repoIdToAllKey: Map<string, string>;
  source: SelectorSource;
  onChange: (value: { mechId: string; chassis: string; variant: string }) => void;
  disabled: boolean;
};

export const MechSelector: React.FC<MechSelectorProps> = ({
  selectedMechId,
  selectedChassis,
  selectedVariant,
  allConfiguredMechs,
  repositoryMechs,
  repoIdToAllKey,
  source,
  onChange,
  disabled,
}) => {
  const options = useMemo(() => {
    const list = source === "repository" ? repositoryMechs : allConfiguredMechs;
    return list
      .map((mech) => ({
        mechId: mech.key,
        chassis: mech.chassis,
        variant: mech.variant,
      }))
      .sort((a, b) => `${a.chassis}|${a.variant}`.localeCompare(`${b.chassis}|${b.variant}`));
  }, [allConfiguredMechs, repositoryMechs, source]);

  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const option of options) {
      const list = map.get(option.chassis) ?? [];
      if (!list.includes(option.variant)) {
        list.push(option.variant);
      }
      map.set(option.chassis, list);
    }
    return Array.from(map.entries())
      .map(([chassis, variants]) => ({
        chassis,
        variants: variants.slice().sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.chassis.localeCompare(b.chassis));
  }, [options]);

  const effectiveSelectedId = useMemo(() => {
    const effectiveSelectedId =
      source === "all" ? (repoIdToAllKey.get(selectedMechId) ?? selectedMechId) : selectedMechId;
    return effectiveSelectedId;
  }, [repoIdToAllKey, selectedMechId, source]);

  const selectedOption = useMemo(() => {
    return options.find((option) => option.mechId === effectiveSelectedId) ?? null;
  }, [effectiveSelectedId, options]);

  const chassisValue = selectedChassis || selectedOption?.chassis || "";
  const variantValue = selectedVariant || selectedOption?.variant || "";

  const selectedToken = variantValue
    ? `variant|${chassisValue}|${variantValue}`
    : chassisValue
      ? `chassis|${chassisValue}`
      : "";

  const flattenedOptions = useMemo(() => {
    const items: Array<{ token: string; label: string; indent: boolean }> = [];
    for (const group of grouped) {
      items.push({ token: `chassis|${group.chassis}`, label: group.chassis, indent: false });
      for (const variant of group.variants) {
        items.push({ token: `variant|${group.chassis}|${variant}`, label: variant, indent: true });
      }
    }
    return items;
  }, [grouped]);

  return (
    <Stack spacing={1} sx={{ width: "100%" }}>
      <FormControl size="small" variant="standard" fullWidth>
        <Select
          displayEmpty
          value={selectedToken}
          disabled={disabled || flattenedOptions.length === 0}
          renderValue={(value) => {
            const token = String(value);
            if (!token) return "Select Mech";
            const [kind, chassis, variant] = token.split("|");
            if (kind === "chassis") return chassis;
            return `${chassis} / ${variant}`;
          }}
          onChange={(event) => {
            const token = String(event.target.value);
            const [kind, chassis, variant] = token.split("|");
            if (kind === "chassis") {
              onChange({ mechId: "", chassis, variant: "" });
              return;
            }
            onChange({ mechId: "", chassis, variant: variant ?? "" });
          }}
        >
          <MenuItem value="">Select Mech</MenuItem>
          {flattenedOptions.map((option) => (
            <MenuItem
              key={option.token}
              value={option.token}
              sx={option.indent ? { pl: 4 } : undefined}
            >
              {option.indent ? `- ${option.label}` : option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Stack>
  );
};
