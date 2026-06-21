export type WeightClass = "Light" | "Medium" | "Heavy" | "Assault";

export type KeyFactors = {
  ecm: boolean;
  bap: boolean;
  jumpJets: boolean;
  speedKph: number;
};

export type Slot = {
  slotId: string;
  weightClass: WeightClass;
  chassis: string;
  variant: string;
  pilot: string;
  candidatePilots: string[];
  buildLink: string;
  skillCode: string;
  role: string;
  keyFactors: KeyFactors;
  isBackup: boolean;
  notes: string;
};

export type Drop = {
  dropNumber: number;
  slots: Slot[];
  mapLink: string;
  locked: boolean;
};

export type MatchNightCreateInput = {
  teamId: string;
  seasonId: string;
  date: string;
  round: number;
  opponent: string;
  drops: Drop[];
};

export type MatchNightDoc = MatchNightCreateInput & {
  id: string;
  updatedAt: string;
  updatedBy: string;
  schemaVersion: "1.0.0";
  docType: "matchNight";
};

export type MechDoc = {
  id: string;
  class: WeightClass;
  tech: "IS" | "Clan";
  tonnage: number;
  chassis: string;
  variant: string;
  buildUrl: string;
  skillCode: string;
  weaponry: string;
  equipment: string[];
  description: string;
  role: string;
  buildCodes: Record<string, string>;
  primaryRangeBracket: [number, number];
  optimalRange: number;
  maxRange: number;
  schemaVersion: "1.0.0";
  docType: "mech";
};

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: { code: string; message: string; details?: unknown } };

export type VariantSummary = {
  variant: string;
  buildCount: number;
};

export type ChassisSummary = {
  chassis: string;
  buildCount: number;
  variants: VariantSummary[];
};

export type WeightClassSummary = {
  class: WeightClass;
  buildCount: number;
  chassis: ChassisSummary[];
};
