import type { DeckMap, MapConfigDoc } from "../../types/contracts.js";
import { MAP_ASSET_CONFIGS, MAP_ORDER } from "../../constants/mapAssets.js";
import { getConfigContainer } from "../cosmos.js";

const MAP_NAME_SET = new Set<string>(MAP_ORDER);

type RawMapConfig = {
  id?: string;
  name?: string;
  imageUrl?: string;
  gridUrl?: string;
  url?: string;
  maproomUrl?: string;
  roomUrl?: string;
  iframeUrl?: string;
};

export async function listMapConfigs(): Promise<MapConfigDoc[]> {
  const container = getConfigContainer();
  const { resources } = await container.items
    .query<RawMapConfig>({
      query:
        "SELECT c.id, c.name, c.imageUrl, c.gridUrl, c.url, c.maproomUrl, c.roomUrl, c.iframeUrl FROM c WHERE IS_DEFINED(c.name)",
    })
    .fetchAll();

  const normalized = new Map<DeckMap, MapConfigDoc>();
  for (const doc of resources) {
    const name = doc.name?.trim();
    if (!name || !MAP_NAME_SET.has(name)) continue;

    normalized.set(name as DeckMap, {
      id: doc.id ?? name,
      name: name as DeckMap,
      imageUrl: (doc.imageUrl ?? doc.url ?? "").trim(),
      gridUrl: (doc.gridUrl ?? "").trim(),
      maproomUrl: (doc.maproomUrl ?? doc.roomUrl ?? doc.iframeUrl ?? "").trim(),
    });
  }

  const merged = MAP_ASSET_CONFIGS.map<MapConfigDoc>((entry) => {
    const fromDb = normalized.get(entry.name);
    return {
      id: fromDb?.id ?? entry.name,
      name: entry.name,
      imageUrl: fromDb?.imageUrl || entry.imageUrl,
      gridUrl: fromDb?.gridUrl || entry.gridUrl,
      maproomUrl: fromDb?.maproomUrl ?? "",
    };
  });

  merged.sort((a, b) => MAP_ORDER.indexOf(a.name) - MAP_ORDER.indexOf(b.name));
  return merged;
}

export async function upsertMapConfig(input: { name: DeckMap; imageUrl: string; maproomUrl: string }): Promise<MapConfigDoc> {
  const container = getConfigContainer();
  const payload = {
    id: input.name,
    name: input.name,
    imageUrl: input.imageUrl,
    maproomUrl: input.maproomUrl,
  };

  const { resource } = await container.items.upsert<RawMapConfig>(payload);
  if (!resource) {
    throw new Error("UPSERT_FAILED");
  }

  return {
    id: resource.id ?? input.name,
    name: input.name,
    imageUrl: (resource.imageUrl ?? input.imageUrl ?? "").trim(),
    gridUrl: (resource.gridUrl ?? "").trim(),
    maproomUrl: (resource.maproomUrl ?? input.maproomUrl ?? "").trim(),
  };
}
