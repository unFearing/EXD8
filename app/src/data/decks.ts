export interface DropSlot {
  slot: number;
  weightClass: "Light" | "Medium" | "Heavy" | "Assault" | "Commander";
  pilot: string;
  mech: string;
  variant: string;
  role: string;
  keyFactors: string;
  buildLink?: string;
  skillCode?: string;
  candidateBackup?: string;
}

export interface Drop {
  dropNumber: 1 | 2 | 3 | 4 | 5;
  name: string;
  gameMode: "Domination" | "Conquest";
  map: string;
  slots: DropSlot[];
}

export interface DecksData {
  season: string;
  round: number;
  drops: Drop[];
}

export const CS2026_ROUND1: DecksData = {
  season: "Championship Series 2026",
  round: 1,
  drops: [
    {
      dropNumber: 1,
      name: "Reconnaissance",
      gameMode: "Domination",
      map: "Caustic Valley",
      slots: [
        { slot: 1, weightClass: "Light", pilot: "Xiphias", mech: "SHC", variant: "PRIME", role: "Scout", keyFactors: "ECM, high speed" },
        { slot: 2, weightClass: "Light", pilot: "Rabbid0Squirrel", mech: "JR7-IIC", variant: "A", role: "Flanker", keyFactors: "jump jets, fast rotate" },
        { slot: 3, weightClass: "Light", pilot: "Itsalrightwithme", mech: "FLE", variant: "20", role: "Harass", keyFactors: "high speed" },
        { slot: 4, weightClass: "Light", pilot: "GrillSquad", mech: "IFR", variant: "Prime", role: "Anchor light", keyFactors: "BAP, speed" },
        { slot: 5, weightClass: "Medium", pilot: "ChapDude", mech: "PHX", variant: "1B", role: "Skirmish", keyFactors: "jump jets" },
        { slot: 6, weightClass: "Medium", pilot: "NeirSolon", mech: "HBK-IIC", variant: "", role: "Midline trade", keyFactors: "laser pressure" },
        { slot: 7, weightClass: "Medium", pilot: "Extra_Better", mech: "SMN", variant: "Prime", role: "Flex", keyFactors: "energy pressure" },
        { slot: 8, weightClass: "Medium", pilot: "Saikyou", mech: "SHC", variant: "45", role: "DPM support", keyFactors: "speed, poke" },
      ],
    },
    {
      dropNumber: 2,
      name: "Recon In Force",
      gameMode: "Conquest",
      map: "HPG Manifold",
      slots: [
        { slot: 1, weightClass: "Light", pilot: "Xiphias", mech: "SHC", variant: "PRIME", role: "Scout", keyFactors: "ECM" },
        { slot: 2, weightClass: "Light", pilot: "Rabbid0Squirrel", mech: "JR7-IIC", variant: "A", role: "Cap pressure", keyFactors: "speed" },
        { slot: 3, weightClass: "Medium", pilot: "ChapDude", mech: "HBK-IIC", variant: "", role: "Brawl trade", keyFactors: "close pressure" },
        { slot: 4, weightClass: "Medium", pilot: "NeirSolon", mech: "NOVA", variant: "", role: "Midline", keyFactors: "laser sustain" },
        { slot: 5, weightClass: "Medium", pilot: "GrillSquad", mech: "PHX", variant: "1B", role: "Flank support", keyFactors: "jump jets" },
        { slot: 6, weightClass: "Medium", pilot: "Itsalrightwithme", mech: "VLKN", variant: "5T", role: "Utility", keyFactors: "anti-light" },
        { slot: 7, weightClass: "Heavy", pilot: "Extra_Better", mech: "TBR", variant: "PRIME", role: "Main trade", keyFactors: "range control" },
        { slot: 8, weightClass: "Heavy", pilot: "Saikyou", mech: "HBR", variant: "PRIME", role: "Utility heavy", keyFactors: "ECM" },
      ],
    },
    {
      dropNumber: 3,
      name: "Commander Assassination",
      gameMode: "Conquest",
      map: "HPG Manifold",
      slots: [
        { slot: 1, weightClass: "Commander", pilot: "Extra_Better", mech: "AS7", variant: "S", role: "Commander anchor", keyFactors: "high armor" },
        { slot: 2, weightClass: "Medium", pilot: "NeirSolon", mech: "NOVA", variant: "", role: "Screen support", keyFactors: "laser pressure" },
        { slot: 3, weightClass: "Medium", pilot: "ChapDude", mech: "PHX", variant: "1B", role: "Flank cut", keyFactors: "jump jets" },
        { slot: 4, weightClass: "Medium", pilot: "Itsalrightwithme", mech: "VLKN", variant: "5T", role: "Peel", keyFactors: "anti-light" },
        { slot: 5, weightClass: "Heavy", pilot: "Saikyou", mech: "TBR", variant: "PRIME", role: "Main trade", keyFactors: "range" },
        { slot: 6, weightClass: "Heavy", pilot: "GrillSquad", mech: "SMN", variant: "Prime", role: "Push assist", keyFactors: "mobility" },
        { slot: 7, weightClass: "Heavy", pilot: "Rabbid0Squirrel", mech: "HBR", variant: "PRIME", role: "Utility", keyFactors: "ECM" },
        { slot: 8, weightClass: "Heavy", pilot: "Xiphias", mech: "MAD DOG", variant: "Prime", role: "Missile/pressure flex", keyFactors: "team pressure" },
      ],
    },
    {
      dropNumber: 4,
      name: "Flank Engagement",
      gameMode: "Conquest",
      map: "Polar Highlands",
      slots: [
        { slot: 1, weightClass: "Light", pilot: "Xiphias", mech: "SHC", variant: "PRIME", role: "Scout", keyFactors: "ECM" },
        { slot: 2, weightClass: "Light", pilot: "Rabbid0Squirrel", mech: "JR7-IIC", variant: "A", role: "Flank", keyFactors: "speed" },
        { slot: 3, weightClass: "Medium", pilot: "ChapDude", mech: "HBK-IIC", variant: "", role: "Mid brawl", keyFactors: "burst" },
        { slot: 4, weightClass: "Medium", pilot: "NeirSolon", mech: "NOVA", variant: "", role: "Mid trade", keyFactors: "laser" },
        { slot: 5, weightClass: "Heavy", pilot: "GrillSquad", mech: "TBR", variant: "PRIME", role: "Mainline", keyFactors: "trade" },
        { slot: 6, weightClass: "Heavy", pilot: "Itsalrightwithme", mech: "HBR", variant: "PRIME", role: "Utility", keyFactors: "ECM" },
        { slot: 7, weightClass: "Assault", pilot: "Extra_Better", mech: "STK", variant: "4N", role: "Anchor", keyFactors: "high armor" },
        { slot: 8, weightClass: "Assault", pilot: "Saikyou", mech: "EXE", variant: "Prime", role: "Fast assault", keyFactors: "mobility" },
      ],
    },
    {
      dropNumber: 5,
      name: "Center of Battle Engagement",
      gameMode: "Conquest",
      map: "Polar Highlands",
      slots: [
        { slot: 1, weightClass: "Light", pilot: "Xiphias", mech: "SHC", variant: "PRIME", role: "Scout", keyFactors: "ECM" },
        { slot: 2, weightClass: "Light", pilot: "Rabbid0Squirrel", mech: "JR7-IIC", variant: "A", role: "Cap/spot", keyFactors: "speed" },
        { slot: 3, weightClass: "Heavy", pilot: "ChapDude", mech: "TBR", variant: "PRIME", role: "Heavy trade", keyFactors: "range" },
        { slot: 4, weightClass: "Heavy", pilot: "NeirSolon", mech: "HBR", variant: "PRIME", role: "Utility heavy", keyFactors: "ECM" },
        { slot: 5, weightClass: "Assault", pilot: "Extra_Better", mech: "STK", variant: "4N", role: "Frontline", keyFactors: "armor + sustain" },
        { slot: 6, weightClass: "Assault", pilot: "Saikyou", mech: "MCII", variant: "2", role: "Main pressure", keyFactors: "alpha" },
        { slot: 7, weightClass: "Assault", pilot: "GrillSquad", mech: "KDK", variant: "3", role: "DPS anchor", keyFactors: "sustained fire" },
        { slot: 8, weightClass: "Assault", pilot: "Itsalrightwithme", mech: "BNC", variant: "3M", role: "Flex assault", keyFactors: "speed for class" },
      ],
    },
  ],
};
