import { z } from "zod";

export const weightClassSchema = z.enum(["Light", "Medium", "Heavy", "Assault"]);
export type WeightClass = z.infer<typeof weightClassSchema>;

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
export type MatchNightCreateInput = z.infer<typeof matchNightCreateInputSchema>;
export type MatchNightDoc = z.infer<typeof matchNightDocSchema>;
export type BuildDoc = z.infer<typeof buildDocSchema>;
export type UserDoc = z.infer<typeof userDocSchema>;
export type SeasonDoc = z.infer<typeof seasonDocSchema>;
