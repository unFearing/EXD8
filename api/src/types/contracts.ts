import { z } from "zod";

export const weightClassSchema = z.enum(["Light", "Medium", "Heavy", "Assault"]);
export type WeightClass = z.infer<typeof weightClassSchema>;

export const deckMapSchema = z.enum(["Alpine Peaks", "Bear Claw II", "Crimson Strait", "Frozen City", "River City"]);
export type DeckMap = z.infer<typeof deckMapSchema>;

export const deckSideSchema = z.enum(["1", "2", "either"]);
export type DeckSide = z.infer<typeof deckSideSchema>;

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

function applyMechTonnageClassRefinement<T extends { class: WeightClass; tonnage: number }>(
  schema: z.ZodType<T>
): z.ZodEffects<z.ZodType<T>> {
  return schema.superRefine((value, context) => {
    if (!weightClassByTonnage[value.class].includes(value.tonnage)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tonnage"],
        message: `tonnage ${value.tonnage} does not match class ${value.class}`,
      });
    }
  });
}

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
});

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
  schemaVersion: z.literal("1.0.0"),
  docType: z.literal("dropDeck"),
});

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
  class: weightClassSchema,
  tech: mechTechSchema,
  tonnage: z
    .number()
    .int()
    .refine((value) => allowedTonnages.has(value), {
      message: "tonnage must be between 20 and 100 in increments of 5",
    }),
  chassis: z.string().min(1),
  variant: z.string().min(1),
  buildUrl: z.string().url(),
  skillCode: z.string().min(1),
  weaponry: z.string(),
  equipment: z.array(z.string().min(1)),
  description: z.string(),
  role: mechRoleSchema,
  buildCodes: z.record(z.string()),
  primaryRangeBracket: primaryRangeBracketSchema,
  optimalRange: z.number().nonnegative(),
  maxRange: z.number().nonnegative(),
  schemaVersion: z.literal("1.0.0"),
  docType: z.literal("mech"),
});

export const mechDocSchema = applyMechTonnageClassRefinement(mechDocBaseSchema);

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
export type MapConfigDoc = z.infer<typeof mapConfigDocSchema>;
export type MatchNightCreateInput = z.infer<typeof matchNightCreateInputSchema>;
export type MatchNightDoc = z.infer<typeof matchNightDocSchema>;
export type BuildDoc = z.infer<typeof buildDocSchema>;
export type MechDoc = z.infer<typeof mechDocSchema>;

const createMechInputBaseSchema = mechDocBaseSchema.omit({
  id: true,
  schemaVersion: true,
  docType: true,
});
export const createMechInputSchema = applyMechTonnageClassRefinement(createMechInputBaseSchema);
export type CreateMechInput = z.infer<typeof createMechInputSchema>;

const upsertMechInputBaseSchema = mechDocBaseSchema.omit({
  schemaVersion: true,
  docType: true,
});
export const upsertMechInputSchema = applyMechTonnageClassRefinement(upsertMechInputBaseSchema);
export type UpsertMechInput = z.infer<typeof upsertMechInputSchema>;
export type UserDoc = z.infer<typeof userDocSchema>;
export type SeasonDoc = z.infer<typeof seasonDocSchema>;
