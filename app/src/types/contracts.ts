export type WeightClass = "Light" | "Medium" | "Heavy" | "Assault";

export type DeckMap = "Alpine Peaks" | "Bear Claw II" | "Crimson Strait" | "Frozen City" | "River City";
export type DeckSide = "1" | "2" | "either";
export type LegacyDeckSide = DeckSide | "Team 1" | "Team 2" | "Agnostic";
export type Lance = "A" | "B" | "C" | "";

export type DeckRowDoc = {
  slot: number;
  primary: string[];
  alternates: string[];
  lance: Lance;
  mech: string;
};

export type DropDeckDoc = {
  id: string;
  map: DeckMap;
  side: LegacyDeckSide;
  description?: string;
  strategy?: string;
  name: string;
  deck: DeckRowDoc[];
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
  schemaVersion?: "1.0.0";
  docType?: "dropDeck";
};

export type DropDeckEditable = {
  map: DeckMap;
  side: DeckSide;
  description: string;
  name: string;
  deck: DeckRowDoc[];
};

export type DropDeckUpsertInput = {
  id?: string;
  baseRevision?: number;
  baseDeck?: DropDeckEditable;
  map: DeckMap;
  side: DeckSide;
  description: string;
  name: string;
  deck: DeckRowDoc[];
};

export type MapConfigDoc = {
  id: string;
  name: DeckMap;
  imageUrl: string;
};

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
