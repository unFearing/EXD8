import type { DeckMap, MapConfigDoc } from "../../types/contracts.js";
import { getConfigContainer } from "../cosmos.js";

const MAP_ORDER: DeckMap[] = ["Alpine Peaks", "Bear Claw II", "Crimson Strait", "Frozen City", "River City"];
const MAP_NAME_SET = new Set<string>(MAP_ORDER);

type RawMapConfig = {
  id?: string;
  name?: string;
  imageUrl?: string;
  url?: string;
};

export async function listMapConfigs(): Promise<MapConfigDoc[]> {
  const container = getConfigContainer();
  const { resources } = await container.items
    .query<RawMapConfig>({
      query:
        "SELECT c.id, c.name, c.imageUrl, c.url FROM c WHERE IS_DEFINED(c.name) AND (IS_DEFINED(c.imageUrl) OR IS_DEFINED(c.url))",
    })
    .fetchAll();

  const normalized = resources
    .map((doc) => {
      const name = doc.name?.trim();
      if (!name || !MAP_NAME_SET.has(name)) return null;
      const imageUrl = (doc.imageUrl ?? doc.url ?? "").trim();
      if (!imageUrl) return null;

      return {
        id: doc.id ?? name,
        name: name as DeckMap,
        imageUrl,
      } satisfies MapConfigDoc;
    })
    .filter((value): value is MapConfigDoc => Boolean(value));

  normalized.sort((a, b) => MAP_ORDER.indexOf(a.name) - MAP_ORDER.indexOf(b.name));
  return normalized;
}
