export type WeightClass = "Light" | "Medium" | "Heavy" | "Assault";

export type DeckMap = "Alpine Peaks" | "Bear Claw II" | "Crimson Strait" | "Frozen City" | "River City";
export type DeckSide = "1" | "2" | "either";
export type LegacyDeckSide = DeckSide | "Team 1" | "Team 2" | "Agnostic";
export type Lance = "A" | "B" | "C" | "";
export type QuickslotKey = "A" | "B" | "C" | "D" | "E";

export type DeckRowDoc = {
  slot: number;
  primary: string[];
  alternates: string[];
  lance: Lance;
  mech: string;
  chassis?: string;
  variant?: string;
  weaponry?: string;
  equipmentText?: string;
  codename?: string;
  buildUrl?: string;
  role?: string;
  loadout?: string;
  buildCode?: string;
  skillTree?: string;
  weightClass?: WeightClass | "";
  tonnage?: number | "";
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
  schemaVersion?: "1.0" | "1.0.0";
  docType?: "dropDeck";
  _rid?: string;
  _self?: string;
  _etag?: string;
  _attachments?: string;
  _ts?: number;
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

export type QuickslotEntry = {
  map: DeckMap;
  slot: QuickslotKey;
  deckId?: string;
};

export type QuickslotDoc = {
  id: string;
  slots: QuickslotEntry[];
  updatedAt?: string;
  updatedBy?: string;
  schemaVersion?: "1.0.0";
  docType?: "quickslot";
};

export type QuickslotUpsertInput = {
  id?: string;
  slots: QuickslotEntry[];
};

export type MapConfigDoc = {
  id: string;
  name: DeckMap;
  imageUrl: string;
  gridUrl?: string;
  maproomUrl?: string;
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
  chassis: string;
  variant: string;
  codename: string;
  link: string;
  skillCode: string;
  weaponry: string;
  description: string;
  role: string;
  buildCodes: Record<string, string>;
  metadata: {
    equipment: string[];
    ranges: {
      optimal: number;
      max: number;
      idealMin: number;
      idealMax: number;
    };
    heat: {
      generation: number;
      capacity: number;
      dissipation: number;
    };
    dps: {
      sustained: number;
      max: number;
    };
  };
  schemaVersion: "1.0" | "1.0.0";
  docType?: "mech";
  class?: WeightClass;
  tech?: "IS" | "Clan";
  tonnage?: number;
  buildUrl?: string;
  submittedBy?: string;
  equipment?: string[];
  primaryRangeBracket?: [number, number];
  optimalRange?: number;
  maxRange?: number;
  markdown?: string;
  _rid?: string;
  _self?: string;
  _etag?: string;
  _attachments?: string;
  _ts?: number;
};

export type MechsConfigClass = "LIGHT" | "MEDIUM" | "HEAVY" | "ASSAULT";
export type MechsConfigTech = "IS" | "Clan";

export type MechsConfigChassis = {
  chassis_name: string;
  tonnage: number;
  chassis_code: string;
  variants: string[];
};

export type MechsConfigFile = {
  mechs: Record<MechsConfigTech, Record<MechsConfigClass, Record<string, MechsConfigChassis>>>;
};

export type ConfigMech = {
  key: string;
  tech: MechsConfigTech;
  class: WeightClass;
  chassis: string;
  variant: string;
  tonnage: number;
};

export type SelectorSource = "config" | "both" | "repository";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: { code: string; message: string; details?: unknown } };

export type VariantSummary = {
  variant: string;
  buildCount: number;
  builds: Array<{
    id: string;
    markdown: string;
  }>;
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

export type DropDeckRules = {
  maxLights?: number;
  maxMediums?: number;
  maxHeavies?: number;
  maxAssaults?: number;
  maxTonnage?: number;
  minTonnage?: number;
  maxDuplicateChassis?: number;
};

export type CreateMechInput = {
  chassis: string;
  variant: string;
  codename: string;
  link: string;
  weaponry: string;
  description: string;
  role: string;
  buildCodes: Record<string, string>;
  skillCode: string;
  metadata: {
    equipment: string[];
    ranges: {
      optimal: number;
      max: number;
      idealMin: number;
      idealMax: number;
    };
    heat: {
      generation: number;
      capacity: number;
      dissipation: number;
    };
    dps: {
      sustained: number;
      max: number;
    };
  };
  class?: WeightClass;
  tech?: "IS" | "Clan";
  tonnage?: number;
  buildUrl?: string;
  equipment?: string[];
  primaryRangeBracket?: [number, number];
  optimalRange?: number;
  maxRange?: number;
};

export type ParsedMechBuild = {
  sourceUrl: string;
  warnings: string[];
  metadata: Record<string, string | number | boolean | null>;
  draft: CreateMechInput;
};
