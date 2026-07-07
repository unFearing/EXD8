import type { DeckMap } from "../types/contracts.js";

export type CompetitionProfile = {
  id: string;
  title: string;
  majorTabMode: "map" | "drop";
  majorTabs: DeckMap[];
  teamSize: number;
  rules: {
    maxTonnage: number;
    maxPerClass: number;
    noDuplicateChassis: boolean;
    format: "BO1" | "BO3" | "BO5";
  };
};

export const CS26_COMPETITION: CompetitionProfile = {
  id: "CS26",
  title: "Comp Series 26",
  majorTabMode: "map",
  majorTabs: ["Alpine Peaks", "Bear Claw II", "Crimson Strait", "Frozen City", "River City"],
  teamSize: 8,
  rules: {
    maxTonnage: 480,
    maxPerClass: 3,
    noDuplicateChassis: true,
    format: "BO1",
  },
};
