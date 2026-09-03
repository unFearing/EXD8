import { memo, useMemo } from "react";
import { FormControl, MenuItem, Select, Stack } from "@mui/material";
import type { ConfigMech, SelectorSource } from "../types/contracts";

type MechSelectorProps = {
  selectedMechId: string;
  selectedChassis: string;
  selectedVariant: string;
  selectedName?: string;
  allConfiguredMechs: ConfigMech[];
  repositoryMechs: ConfigMech[];
  repoIdToAllKey: Map<string, string>;
  source: SelectorSource;
  onChange: (value: { mechId: string; chassis: string; variant: string }) => void;
  disabled: boolean;
};

const MechSelectorComponent: React.FC<MechSelectorProps> = ({
  selectedMechId,
  selectedChassis,
  selectedVariant,
  selectedName,
  allConfiguredMechs,
  repositoryMechs,
  repoIdToAllKey,
  source,
  onChange,
  disabled,
}) => {
  const options = useMemo(() => {
    const list = source === "repository"
      ? repositoryMechs
      : source === "config"
        ? allConfiguredMechs
        : [...allConfiguredMechs, ...repositoryMechs];
    return list
      .map((mech) => ({
        mechId: mech.key,
        chassis: mech.chassis,
        variant: mech.variant,
        name: mech.name,
        tonnage: mech.tonnage,
      }))
      .sort((a, b) => {
        const tonnageDelta = (a.tonnage ?? Number.POSITIVE_INFINITY) - (b.tonnage ?? Number.POSITIVE_INFINITY);
        if (tonnageDelta !== 0) return tonnageDelta;
        const chassisDelta = a.chassis.localeCompare(b.chassis);
        if (chassisDelta !== 0) return chassisDelta;
        return a.variant.localeCompare(b.variant);
      });
  }, [allConfiguredMechs, repositoryMechs, source]);

  const grouped = useMemo(() => {
    const map = new Map<string, Array<{ variant: string; tonnage: number; name?: string }>>();
    const chassisTonnage = new Map<string, number>();
    for (const option of options) {
      const list = map.get(option.chassis) ?? [];
      if (!list.some((entry) => entry.variant === option.variant)) {
        list.push({ variant: option.variant, tonnage: option.tonnage, name: option.name });
      }
      map.set(option.chassis, list);
      const existing = chassisTonnage.get(option.chassis);
      if (existing === undefined || option.tonnage < existing) chassisTonnage.set(option.chassis, option.tonnage);
    }
    return Array.from(map.entries())
      .map(([chassis, variants]) => ({
        chassis,
        variants: variants.slice().sort((a, b) => a.tonnage - b.tonnage || a.variant.localeCompare(b.variant)),
        tonnage: chassisTonnage.get(chassis) ?? Number.POSITIVE_INFINITY,
      }))
      .sort((a, b) => a.tonnage - b.tonnage || a.chassis.localeCompare(b.chassis));
  }, [options]);

  const effectiveSelectedId = useMemo(
    () => source === "config" ? (repoIdToAllKey.get(selectedMechId) ?? selectedMechId) : selectedMechId,
    [repoIdToAllKey, selectedMechId, source],
  );
  const selectedOption = useMemo(
    () => options.find((option) => option.mechId === effectiveSelectedId) ?? null,
    [effectiveSelectedId, options],
  );
  const chassisValue = selectedChassis || selectedOption?.chassis || "";
  const variantValue = selectedVariant || selectedOption?.variant || "";
  const chassisOptions = grouped;
  const variantOptions = useMemo(
    () => chassisOptions.find((group) => group.chassis === chassisValue)?.variants ?? [],
    [chassisOptions, chassisValue],
  );
  const resolvedChassisValue = useMemo(() => {
    if (!chassisValue) return "";
    return chassisOptions.some((group) => group.chassis === chassisValue) ? chassisValue : selectedOption?.chassis || "";
  }, [chassisOptions, chassisValue, selectedOption?.chassis]);
  const resolvedVariantValue = useMemo(() => {
    if (!resolvedChassisValue) return "";
    if (variantOptions.some((entry) => entry.variant === variantValue)) return variantValue;
    return selectedOption?.variant || "";
  }, [resolvedChassisValue, selectedOption?.variant, variantOptions, variantValue]);
  const selectValue = useMemo(() => {
    if (!resolvedChassisValue) return "";
    return resolvedVariantValue || "";
  }, [resolvedChassisValue, resolvedVariantValue]);
  const chassisMenuOptions = chassisOptions;
  const variantMenuOptions = resolvedChassisValue ? variantOptions : [];

  return (
    <Stack sx={{ width: "100%" }}>
      <FormControl size="small" variant="standard" fullWidth>
        <Select
          displayEmpty
          value={selectValue}
          disabled={disabled || (resolvedChassisValue ? variantOptions.length === 0 : chassisOptions.length === 0)}
          renderValue={() => {
            if (!resolvedChassisValue) return "Select Mech";
            if (!resolvedVariantValue) return resolvedChassisValue;
            const chosen = variantOptions.find((entry) => entry.variant === resolvedVariantValue);
            const label = chosen?.name ? `${resolvedVariantValue} / ${chosen.name}` : resolvedVariantValue;
            return `${resolvedChassisValue} / ${label}${selectedName?.trim() ? ` / ${selectedName.trim()}` : ""}`;
          }}
          onChange={(event) => {
            const nextValue = String(event.target.value || "");
            if (!chassisValue) {
              const nextChassis = nextValue;
              if (!nextChassis) {
                onChange({ mechId: "", chassis: "", variant: "" });
                return;
              }
              onChange({ mechId: "", chassis: nextChassis, variant: "" });
              return;
            }

            if (!nextValue) {
              onChange({ mechId: "", chassis: chassisValue, variant: "" });
              return;
            }

            const match = options.find((option) => option.chassis === chassisValue && option.variant === nextValue);
            onChange({ mechId: match?.mechId ?? "", chassis: chassisValue, variant: nextValue });
          }}
        >
          {chassisValue
            ? variantMenuOptions.map((variant) => (
                <MenuItem key={`${chassisValue}:${variant.variant}`} value={variant.variant}>
                  {variant.name ? `${variant.variant} / ${variant.name}` : variant.variant}
                </MenuItem>
              ))
            : chassisMenuOptions.map((group) => (
                <MenuItem key={group.chassis} value={group.chassis}>
                  {Number.isFinite(group.tonnage) ? `${group.chassis} (${group.tonnage}t)` : group.chassis}
                </MenuItem>
              ))}
        </Select>
      </FormControl>
    </Stack>
  );
};

export const MechSelector = memo(MechSelectorComponent, (prev, next) => (
  prev.selectedMechId === next.selectedMechId &&
  prev.selectedChassis === next.selectedChassis &&
  prev.selectedVariant === next.selectedVariant &&
  prev.selectedName === next.selectedName &&
  prev.disabled === next.disabled &&
  prev.source === next.source &&
  prev.allConfiguredMechs === next.allConfiguredMechs &&
  prev.repositoryMechs === next.repositoryMechs &&
  prev.repoIdToAllKey === next.repoIdToAllKey
));
