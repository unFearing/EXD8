export const MECH_ROLE_VALUES = [
    "Juggernaut",
  "Striker",
  "Skirmisher",
  "Brawler",
  "DPS",
  "Trader (Forward)",
  "Trader (Anchor)"
] as const;

export type MechRoleValue = (typeof MECH_ROLE_VALUES)[number];
