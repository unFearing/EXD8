export type CachedVariant = {
  tech?: "IS" | "Clan";
  label?: string;
};

export type CachedChassis = {
  chassis: string;
  defaultTech: "IS" | "Clan";
  tonnage: number;
  variants?: Record<string, CachedVariant>;
};

// Local cache for mapping NAV-Alpha build codes to normalized mech metadata.
export const navAlphaChassisCatalog: Record<string, CachedChassis> = {
  ACH: {
    chassis: "ACH",
    defaultTech: "Clan",
    tonnage: 30,
  },
  "UM-IIC": {
    chassis: "Clan UrbanMech UM-IIC",
    defaultTech: "Clan",
    tonnage: 30,
  },
  BSK: {
    chassis: "Bullshark",
    defaultTech: "IS",
    tonnage: 95,
    variants: {
      "1": { tech: "IS" },
      "2": { tech: "IS" },
      "3": { tech: "IS" },
      "5": { tech: "IS" },
      "6": { tech: "IS" },
      M: { tech: "Clan", label: "Mako" },
    },
  },
};
