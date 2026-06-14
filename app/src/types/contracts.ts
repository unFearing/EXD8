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

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: { code: string; message: string; details?: unknown } };
