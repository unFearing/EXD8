import { z } from "zod";

export const weightClassSchema = z.enum(["Light", "Medium", "Heavy", "Assault"]);
export type WeightClass = z.infer<typeof weightClassSchema>;

export const deckMapSchema = z.string().min(1);
export type DeckMap = z.infer<typeof deckMapSchema>;

export const deckSideSchema = z.enum(["1", "2", "either"]);
export type DeckSide = z.infer<typeof deckSideSchema>;

export const quickslotKeySchema = z.enum(["A", "B", "C", "D", "E"]);
export type QuickslotKey = z.infer<typeof quickslotKeySchema>;

export const mechTechSchema = z.enum(["IS", "Clan"]);
export type MechTech = z.infer<typeof mechTechSchema>;

export const mechRoleSchema = z.enum([
  "Capper",
  "Striker",
  "Skirmisher",
  "Brawler",
  "Sniper",
  "Fire Support",
  "Juggernaut",
]);
export type MechRole = z.infer<typeof mechRoleSchema>;

const primaryRangeBracketSchema = z
  .tuple([z.number().nonnegative(), z.number().nonnegative()])
  .refine(([minimum, maximum]) => minimum <= maximum, {
    message: "primaryRangeBracket must be ordered from min to max",
  });

const allowedTonnages = new Set([20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]);

const weightClassByTonnage: Record<WeightClass, readonly number[]> = {
  Light: [20, 25, 30, 35],
  Medium: [40, 45, 50, 55],
  Heavy: [60, 65, 70, 75],
  Assault: [80, 85, 90, 95, 100],
};

export const keyFactorsSchema = z.object({
  ecm: z.boolean(),
  bap: z.boolean(),
  jumpJets: z.boolean(),
  speedKph: z.number().nonnegative(),
});

export const slotSchema = z.object({
  slotId: z.string().min(1),
  weightClass: weightClassSchema,
  chassis: z.string().min(1),
  variant: z.string().min(1),
  pilot: z.string().min(1),
  candidatePilots: z.array(z.string()),
  buildLink: z.string().url(),
  skillCode: z.string().min(1),
  role: z.string().min(1),
  keyFactors: keyFactorsSchema,
  isBackup: z.boolean(),
  notes: z.string(),
});

export const dropSchema = z.object({
  dropNumber: z.number().int().positive(),
  slots: z.array(slotSchema).min(1),
  mapLink: z.string().url().or(z.literal("")),
  locked: z.boolean(),
});

export const deckSlotSchema = z.object({
  slot: z.number().int().positive(),
  primary: z.array(z.string()).default([]),
  alternates: z.array(z.string()).default([]),
  lance: z.enum(["", "A", "B", "C"]).default(""),
  mech: z.string().default(""),
  chassis: z.string().default(""),
  variant: z.string().default(""),
  weaponry: z.string().default(""),
  equipmentText: z.string().default(""),
  codename: z.string().default(""),
  buildUrl: z.string().default(""),
  role: z.string().default(""),
  skillTree: z.string().default(""),
});

const cosmosSystemFieldsSchema = z.object({
  _rid: z.string().optional(),
  _self: z.string().optional(),
  _etag: z.string().optional(),
  _attachments: z.string().optional(),
  _ts: z.number().int().optional(),
});

export const schemaVersionSchema = z.enum(["1.0", "1.0.0"]);

export const dropDeckDocSchema = z.object({
  id: z.string().uuid(),
  map: deckMapSchema,
  side: deckSideSchema,
  description: z.string().default(""),
  name: z.string().min(1),
  deck: z.array(deckSlotSchema).min(1),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().min(1),
  schemaVersion: schemaVersionSchema,
  docType: z.literal("dropDeck").optional(),
}).extend(cosmosSystemFieldsSchema.shape);

const dropDeckEditableSchema = z.object({
  map: deckMapSchema,
  side: deckSideSchema,
  description: z.string().default(""),
  name: z.string().min(1),
  deck: z.array(deckSlotSchema).min(1),
});

export const dropDeckUpsertInputSchema = z.object({
  id: z.string().uuid().optional(),
  baseRevision: z.number().int().positive().optional(),
  baseDeck: dropDeckEditableSchema.optional(),
  map: deckMapSchema,
  side: deckSideSchema,
  description: z.string().default(""),
  name: z.string().min(1),
  deck: z.array(deckSlotSchema).min(1),
});

export const quickslotEntrySchema = z.object({
  map: deckMapSchema,
  slot: quickslotKeySchema,
  deckId: z.string().uuid().optional(),
});

export const quickslotDocSchema = z.object({
  id: z.string().min(1),
  slots: z.array(quickslotEntrySchema).max(5),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().min(1),
  schemaVersion: z.literal("1.0.0"),
  docType: z.literal("quickslot"),
}).extend(cosmosSystemFieldsSchema.shape);

export const quickslotUpsertInputSchema = z.object({
  id: z.string().min(1).optional(),
  slots: z.array(quickslotEntrySchema).max(5),
});

export const mapConfigDocSchema = z.object({
  id: z.string().min(1),
  name: deckMapSchema,
  imageUrl: z.string().url().or(z.literal("")),
});

export const matchNightCreateInputSchema = z.object({
  teamId: z.string().min(1),
  seasonId: z.string().min(1),
  date: z.string().min(1),
  round: z.number().int().positive(),
  opponent: z.string().min(1),
  drops: z.array(dropSchema).min(1),
});

export const matchNightDocSchema = matchNightCreateInputSchema.extend({
  id: z.string().min(1),
  comp: z.string().min(1),
  updatedAt: z.string().datetime(),
  updatedBy: z.string().min(1),
  schemaVersion: z.literal("1.0.0"),
  docType: z.literal("matchNight"),
});

export const buildDocSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  chassis: z.string().min(1),
  variant: z.string().min(1),
  weightClass: weightClassSchema,
  role: z.string().min(1),
  buildLink: z.string().url(),
  skillCode: z.string().min(1),
  description: z.string(),
  keyFactors: keyFactorsSchema,
  submittedBy: z.string().min(1),
  submittedAt: z.string().datetime(),
  tags: z.array(z.string()),
  schemaVersion: z.literal("1.0.0"),
  docType: z.literal("build"),
});

const mechDocBaseSchema = z.object({
  id: z.string().uuid(),
  chassis: z.string().min(1),
  variant: z.string().min(1),
  codename: z.string().default(""),
  link: z.string().url().or(z.literal("")),
  skillCode: z.string().min(1),
  weaponry: z.string(),
  description: z.string(),
  role: z.string().min(1),
  buildCodes: z.record(z.string()),
  metadata: z.object({
    equipment: z.array(z.string().min(1)).default([]),
    ranges: z.object({
      optimal: z.number().nonnegative(),
      max: z.number().nonnegative(),
      idealMin: z.number().nonnegative(),
      idealMax: z.number().nonnegative(),
    }),
    heat: z.object({
      generation: z.number().nonnegative(),
      capacity: z.number().nonnegative(),
      dissipation: z.number().nonnegative(),
    }),
    dps: z.object({
      sustained: z.number().nonnegative(),
      max: z.number().nonnegative(),
    }),
  }),
  schemaVersion: schemaVersionSchema,
  docType: z.literal("mech").optional(),
  // Backward-compatible fields kept for existing docs and helpers.
  class: weightClassSchema.optional(),
  tech: mechTechSchema.optional(),
  tonnage: z
    .number()
    .int()
    .refine((value) => allowedTonnages.has(value), {
      message: "tonnage must be between 20 and 100 in increments of 5",
    }).optional(),
  buildUrl: z.string().url().optional(),
  equipment: z.array(z.string().min(1)).optional(),
  primaryRangeBracket: primaryRangeBracketSchema.optional(),
  optimalRange: z.number().nonnegative().optional(),
  maxRange: z.number().nonnegative().optional(),
}).extend(cosmosSystemFieldsSchema.shape);

export const mechDocSchema = mechDocBaseSchema.superRefine((value, context) => {
  if (value.class && typeof value.tonnage === "number" && !weightClassByTonnage[value.class].includes(value.tonnage)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tonnage"],
      message: `tonnage ${value.tonnage} does not match class ${value.class}`,
    });
  }

  if (value.metadata.ranges.idealMin > value.metadata.ranges.idealMax) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["metadata", "ranges"],
      message: "metadata.ranges.idealMin must be <= idealMax",
    });
  }
});

export const userDocSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  discordUsername: z.string().min(1),
  discordAvatar: z.string().optional(),
  role: z.enum(["TL", "Pilot"]),
  lastLoginAt: z.string().datetime(),
  schemaVersion: z.literal("1.0.0"),
  docType: z.literal("user"),
});

export const seasonDocSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  schemaVersion: z.literal("1.0.0"),
  docType: z.literal("season"),
});

export type KeyFactors = z.infer<typeof keyFactorsSchema>;
export type Slot = z.infer<typeof slotSchema>;
export type Drop = z.infer<typeof dropSchema>;
export type DeckSlot = z.infer<typeof deckSlotSchema>;
export type DropDeckDoc = z.infer<typeof dropDeckDocSchema>;
export type DropDeckUpsertInput = z.infer<typeof dropDeckUpsertInputSchema>;
export type QuickslotDoc = z.infer<typeof quickslotDocSchema>;
export type QuickslotUpsertInput = z.infer<typeof quickslotUpsertInputSchema>;
export type MapConfigDoc = z.infer<typeof mapConfigDocSchema>;
export type MatchNightCreateInput = z.infer<typeof matchNightCreateInputSchema>;
export type MatchNightDoc = z.infer<typeof matchNightDocSchema>;
export type BuildDoc = z.infer<typeof buildDocSchema>;
export type MechDoc = z.infer<typeof mechDocSchema>;

const createMechInputBaseSchema = mechDocBaseSchema.omit({
  id: true,
  schemaVersion: true,
  docType: true,
  _rid: true,
  _self: true,
  _etag: true,
  _attachments: true,
  _ts: true,
});
export const createMechInputSchema = createMechInputBaseSchema;
export type CreateMechInput = z.infer<typeof createMechInputSchema>;

const upsertMechInputBaseSchema = mechDocBaseSchema.omit({
  schemaVersion: true,
  docType: true,
  _rid: true,
  _self: true,
  _etag: true,
  _attachments: true,
  _ts: true,
});
export const upsertMechInputSchema = upsertMechInputBaseSchema;
export type UpsertMechInput = z.infer<typeof upsertMechInputSchema>;
export type UserDoc = z.infer<typeof userDocSchema>;
export type SeasonDoc = z.infer<typeof seasonDocSchema>;
