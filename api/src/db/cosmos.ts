import { CosmosClient, type Container } from "@azure/cosmos";

let cachedClient: CosmosClient | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getCosmosClient(): CosmosClient {
  if (!cachedClient) {
    cachedClient = new CosmosClient({
      endpoint: requiredEnv("COSMOS_ENDPOINT"),
      key: requiredEnv("COSMOS_KEY"),
    });
  }
  return cachedClient;
}

export function getContainer(containerName: string): Container {
  const dbName = requiredEnv("COSMOS_DATABASE");
  return getCosmosClient().database(dbName).container(containerName);
}

export function getMatchNightsContainer(): Container {
  return getContainer(process.env.COSMOS_MATCHNIGHTS_CONTAINER ?? "matchNights");
}
