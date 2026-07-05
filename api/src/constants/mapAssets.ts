import type { DeckMap } from "../types/contracts.js";

export type MapAssetConfig = {
  name: DeckMap;
  imageUrl: string;
  gridUrl: string;
};

export const MAP_ASSET_CONFIGS: readonly MapAssetConfig[] = [
  {
    name: "Crimson Strait",
    imageUrl: "https://maps.mwocomp.com/maps/MWO/CONQ_-_Crimson_Strait_-_20230207.png",
    gridUrl: "https://maps.mwocomp.com/icons/GRID_-_Crimson_Strait_20190222.png",
  },
  {
    name: "Bear Claw II",
    imageUrl: "https://maps.mwocomp.com/maps/MWO/CONQ_-_Bearclaw_20231226.png",
    gridUrl: "https://maps.mwocomp.com/icons/GRID_-_Bearclaw_20231226.png",
  },
  {
    name: "Alpine Peaks",
    imageUrl: "https://maps.mwocomp.com/maps/MWO/CONQ_-_Alpine_Peaks_20250324.png",
    gridUrl: "https://maps.mwocomp.com/icons/GRID_-_Alpine_Peaks_20250324.png",
  },
  {
    name: "Frozen City",
    imageUrl: "https://maps.mwocomp.com/maps/MWO/CONQ_-_Frozen_City_20190222.png",
    gridUrl: "https://maps.mwocomp.com/icons/GRID_-_Frozen_City_20190222.png",
  },
  {
    name: "River City",
    imageUrl: "https://maps.mwocomp.com/maps/MWO/CONQ_-_River_City_20190222.png",
    gridUrl: "https://maps.mwocomp.com/icons/GRID_-_River_City_20190222.png",
  },
] as const;

export const MAP_ORDER: DeckMap[] = MAP_ASSET_CONFIGS.map((entry) => entry.name);
