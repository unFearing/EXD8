// Mech Database: All MWO mechs, variants, weight classes, roles, and builds

export type WeightClass = "Light" | "Medium" | "Heavy" | "Assault" | "Commander";

export interface MechBuild {
  name: string;
  role: string;
  skillCode?: string;
  description?: string;
}

export interface MechVariant {
  code: string; // e.g., "SHC-PRIME", "SHC-45"
  displayName: string; // e.g., "Shadowcat Prime", "Shadowcat 45"
  weightClass: WeightClass;
  builds: MechBuild[];
}

export interface Chassis {
  id: string; // e.g., "SHC"
  displayName: string; // e.g., "Shadowcat"
  variants: MechVariant[];
}

// Comprehensive mech database organized by chassis
export const MECH_DATABASE: Chassis[] = [
  // LIGHT MECHS
  {
    id: "SHC",
    displayName: "Shadowcat",
    variants: [
      {
        code: "SHC-PRIME",
        displayName: "Shadowcat Prime",
        weightClass: "Light",
        builds: [
          { name: "ECM Scout", role: "Scout", skillCode: "ECM-001", description: "ECM, high speed" },
          { name: "Speed Scout", role: "Scout", skillCode: "SPD-001", description: "Speed focused" },
        ],
      },
      {
        code: "SHC-45",
        displayName: "Shadowcat 45",
        weightClass: "Medium",
        builds: [
          { name: "DPM Support", role: "DPM support", skillCode: "DPM-001", description: "Speed, poke" },
          { name: "Energy Pressure", role: "Midline", skillCode: "ENR-001" },
        ],
      },
    ],
  },
  {
    id: "JR7-IIC",
    displayName: "Jagermech 7 IIC",
    variants: [
      {
        code: "JR7-IIC-A",
        displayName: "Jagermech 7 IIC-A",
        weightClass: "Light",
        builds: [
          { name: "Flanker", role: "Flanker", skillCode: "FLK-001", description: "Jump jets, fast rotate" },
          { name: "Cap Pressure", role: "Cap pressure", skillCode: "CAP-001", description: "Speed pressure" },
        ],
      },
    ],
  },
  {
    id: "FLE",
    displayName: "Flea",
    variants: [
      {
        code: "FLE-20",
        displayName: "Flea 20",
        weightClass: "Light",
        builds: [
          { name: "Harasser", role: "Harass", skillCode: "HSR-001", description: "High speed" },
        ],
      },
    ],
  },
  {
    id: "IFR",
    displayName: "Infiltrator",
    variants: [
      {
        code: "IFR-Prime",
        displayName: "Infiltrator Prime",
        weightClass: "Light",
        builds: [
          { name: "Light Anchor", role: "Anchor light", skillCode: "ANK-001", description: "BAP, speed" },
        ],
      },
    ],
  },

  // MEDIUM MECHS
  {
    id: "PHX",
    displayName: "Phoenix",
    variants: [
      {
        code: "PHX-1B",
        displayName: "Phoenix 1B",
        weightClass: "Medium",
        builds: [
          { name: "Skirmisher", role: "Skirmish", skillCode: "SKR-001", description: "Jump jets" },
          { name: "Flank Support", role: "Flank support", skillCode: "FLK-002", description: "Jump jets" },
        ],
      },
    ],
  },
  {
    id: "HBK-IIC",
    displayName: "Hunchback IIC",
    variants: [
      {
        code: "HBK-IIC",
        displayName: "Hunchback IIC",
        weightClass: "Medium",
        builds: [
          { name: "Midline Trade", role: "Midline trade", skillCode: "MID-001", description: "Laser pressure" },
          { name: "Brawl Trade", role: "Brawl trade", skillCode: "BRW-001", description: "Close pressure" },
          { name: "Mid Brawl", role: "Mid brawl", skillCode: "BRW-002", description: "Burst damage" },
        ],
      },
    ],
  },
  {
    id: "NOVA",
    displayName: "Nova (Black Hawk)",
    variants: [
      {
        code: "NOVA",
        displayName: "Nova",
        weightClass: "Medium",
        builds: [
          { name: "Midline", role: "Midline", skillCode: "MID-002", description: "Laser sustain" },
          { name: "Screen Support", role: "Screen support", skillCode: "SCR-001", description: "Laser pressure" },
          { name: "Mid Trade", role: "Mid trade", skillCode: "MID-003", description: "Laser support" },
        ],
      },
    ],
  },
  {
    id: "VLKN",
    displayName: "Vulcan",
    variants: [
      {
        code: "VLKN-5T",
        displayName: "Vulcan 5T",
        weightClass: "Medium",
        builds: [
          { name: "Utility", role: "Utility", skillCode: "UTL-001", description: "Anti-light" },
          { name: "Peel", role: "Peel", skillCode: "PEL-001", description: "Anti-light" },
        ],
      },
    ],
  },
  {
    id: "SMN",
    displayName: "Summoner",
    variants: [
      {
        code: "SMN-Prime",
        displayName: "Summoner Prime",
        weightClass: "Heavy",
        builds: [
          { name: "Flex", role: "Flex", skillCode: "FLX-001", description: "Energy pressure" },
          { name: "Push Assist", role: "Push assist", skillCode: "PUS-001", description: "Mobility" },
        ],
      },
    ],
  },

  // HEAVY MECHS
  {
    id: "TBR",
    displayName: "Timber Wolf",
    variants: [
      {
        code: "TBR-PRIME",
        displayName: "Timber Wolf Prime",
        weightClass: "Heavy",
        builds: [
          { name: "Main Trade", role: "Main trade", skillCode: "MNT-001", description: "Range control" },
          { name: "Heavy Trade", role: "Heavy trade", skillCode: "HVY-001", description: "Range" },
        ],
      },
    ],
  },
  {
    id: "HBR",
    displayName: "Hunchback",
    variants: [
      {
        code: "HBR-Prime",
        displayName: "Hunchback Prime",
        weightClass: "Heavy",
        builds: [
          { name: "Utility Heavy", role: "Utility heavy", skillCode: "UTL-002", description: "ECM" },
          { name: "ECM", role: "Utility", skillCode: "UTL-003", description: "ECM support" },
        ],
      },
      {
        code: "HBR-PRIME",
        displayName: "Hunchback Prime (alt)",
        weightClass: "Heavy",
        builds: [
          { name: "Utility Heavy", role: "Utility heavy", skillCode: "UTL-002", description: "ECM" },
        ],
      },
    ],
  },
  {
    id: "MDGP",
    displayName: "Mad Dog",
    variants: [
      {
        code: "MAD DOG-Prime",
        displayName: "Mad Dog Prime",
        weightClass: "Heavy",
        builds: [
          {
            name: "Missile/Pressure Flex",
            role: "Missile/pressure flex",
            skillCode: "MSL-001",
            description: "Team pressure",
          },
        ],
      },
    ],
  },

  // ASSAULT MECHS
  {
    id: "STK",
    displayName: "Stalker",
    variants: [
      {
        code: "STK-4N",
        displayName: "Stalker 4N",
        weightClass: "Assault",
        builds: [
          { name: "Anchor", role: "Anchor", skillCode: "ANK-002", description: "High armor" },
          { name: "Frontline", role: "Frontline", skillCode: "FRT-001", description: "Armor + sustain" },
        ],
      },
    ],
  },
  {
    id: "EXE",
    displayName: "Executioner",
    variants: [
      {
        code: "EXE-Prime",
        displayName: "Executioner Prime",
        weightClass: "Assault",
        builds: [
          { name: "Fast Assault", role: "Fast assault", skillCode: "FST-001", description: "Mobility" },
        ],
      },
    ],
  },
  {
    id: "MCII",
    displayName: "Mad Cat Mk II",
    variants: [
      {
        code: "MCII-2",
        displayName: "Mad Cat Mk II 2",
        weightClass: "Assault",
        builds: [
          { name: "Main Pressure", role: "Main pressure", skillCode: "PRS-001", description: "Alpha" },
        ],
      },
    ],
  },
  {
    id: "KDK",
    displayName: "Kodiak",
    variants: [
      {
        code: "KDK-3",
        displayName: "Kodiak 3",
        weightClass: "Assault",
        builds: [
          { name: "DPS Anchor", role: "DPS anchor", skillCode: "DPS-001", description: "Sustained fire" },
        ],
      },
    ],
  },
  {
    id: "BNC",
    displayName: "Banshee",
    variants: [
      {
        code: "BNC-3M",
        displayName: "Banshee 3M",
        weightClass: "Assault",
        builds: [
          { name: "Flex Assault", role: "Flex assault", skillCode: "FLX-201", description: "Speed for class" },
        ],
      },
    ],
  },

  // COMMANDER MECHS
  {
    id: "AS7",
    displayName: "Atlas",
    variants: [
      {
        code: "AS7-S",
        displayName: "Atlas S",
        weightClass: "Commander",
        builds: [
          { name: "Commander Anchor", role: "Commander anchor", skillCode: "CMD-001", description: "High armor" },
        ],
      },
    ],
  },
  {
    id: "DWF",
    displayName: "Dire Wolf",
    variants: [
      {
        code: "DWF-C",
        displayName: "Dire Wolf C",
        weightClass: "Commander",
        builds: [
          { name: "Commander", role: "Commander", skillCode: "CMD-002", description: "Heavy firepower" },
        ],
      },
    ],
  },
  {
    id: "CYC",
    displayName: "Cyclops",
    variants: [
      {
        code: "CYC-IX",
        displayName: "Cyclops IX",
        weightClass: "Commander",
        builds: [
          { name: "Commander Tank", role: "Commander", skillCode: "CMD-003", description: "High armor" },
        ],
      },
    ],
  },
];

// Utility: Get all variant codes for a chassis
export function getVariantsByChassisId(chassisId: string): MechVariant[] {
  const chassis = MECH_DATABASE.find((c) => c.id === chassisId);
  return chassis?.variants || [];
}

// Utility: Find a variant by its code
export function findVariantByCode(code: string): MechVariant | undefined {
  for (const chassis of MECH_DATABASE) {
    const variant = chassis.variants.find((v) => v.code === code);
    if (variant) return variant;
  }
  return undefined;
}

// Utility: Get all chassis codes
export function getAllChassisCodes(): string[] {
  return MECH_DATABASE.map((c) => c.id).sort();
}

// Utility: Get all variant codes for display in dropdowns
export function getAllVariantCodes(): string[] {
  const codes: string[] = [];
  for (const chassis of MECH_DATABASE) {
    for (const variant of chassis.variants) {
      codes.push(variant.code);
    }
  }
  return codes.sort();
}

// Utility: Get build options for a variant
export function getBuildsByVariant(variantCode: string): MechBuild[] {
  const variant = findVariantByCode(variantCode);
  return variant?.builds || [];
}
