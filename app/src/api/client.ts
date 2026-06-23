import type {
  ApiFailure,
  ApiSuccess,
  CreateMechInput,
  DropDeckDoc,
  DropDeckUpsertInput,
  MatchNightCreateInput,
  MatchNightDoc,
  MapConfigDoc,
  MechDoc,
  ParsedMechBuild,
  WeightClassSummary,
} from "../types/contracts";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function parseResponse<T>(response: Response): Promise<ApiSuccess<T>> {
  const rawBody = await response.text();
  let payload: ApiSuccess<T> | ApiFailure | null = null;
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as ApiSuccess<T> | ApiFailure;
    } catch {
      payload = null;
    }
  }

  if (!payload) {
    throw new Error(`Request failed (${response.status})`);
  }

  if (!response.ok || !payload.ok) {
    const errorMessage = payload && !payload.ok ? payload.error.message : `Request failed (${response.status})`;
    const error = new Error(errorMessage) as Error & {
      status?: number;
      code?: string;
      details?: unknown;
    };
    if (payload && !payload.ok) {
      error.code = payload.error.code;
      error.details = payload.error.details;
    }
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function createMatchNight(input: MatchNightCreateInput): Promise<MatchNightDoc> {
  const response = await fetch(`${API_BASE}/matchNights`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-team-id": input.teamId,
      "x-user-role": "TL",
      "x-user-id": "ui-local-user",
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseResponse<MatchNightDoc>(response);
  return parsed.data;
}

export async function getMatchNightById(id: string, teamId: string): Promise<MatchNightDoc> {
  const response = await fetch(`${API_BASE}/matchNights/${encodeURIComponent(id)}?teamId=${encodeURIComponent(teamId)}`, {
    headers: {
      "x-team-id": teamId,
      "x-user-role": "TL",
      "x-user-id": "ui-local-user",
    },
  });

  const parsed = await parseResponse<MatchNightDoc>(response);
  return parsed.data;
}

export async function getMechHierarchy(): Promise<WeightClassSummary[]> {
  const response = await fetch(`${API_BASE}/mechs/hierarchy`);

  const parsed = await parseResponse<WeightClassSummary[]>(response);
  return parsed.data;
}

export async function getMechs(): Promise<MechDoc[]> {
  const response = await fetch(`${API_BASE}/mechs`);

  const parsed = await parseResponse<MechDoc[]>(response);
  return parsed.data;
}

export async function getDropDecks(): Promise<DropDeckDoc[]> {
  const response = await fetch(`${API_BASE}/decks`);

  const parsed = await parseResponse<DropDeckDoc[]>(response);
  return parsed.data;
}

export async function getMapConfigs(): Promise<MapConfigDoc[]> {
  const response = await fetch(`${API_BASE}/config/maps`);

  const parsed = await parseResponse<MapConfigDoc[]>(response);
  return parsed.data;
}

export async function saveDropDeck(input: DropDeckUpsertInput): Promise<DropDeckDoc> {
  const response = await fetch(`${API_BASE}/decks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-id": "deckboard-ui",
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseResponse<DropDeckDoc>(response);
  return parsed.data;
}

export async function createMech(input: CreateMechInput): Promise<MechDoc> {
  const response = await fetch(`${API_BASE}/mechs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-team-id": "EXD8",
      "x-user-role": "TL",
      "x-user-id": "ui-local-user",
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseResponse<MechDoc>(response);
  return parsed.data;
}

export async function parseMechBuild(url: string): Promise<ParsedMechBuild> {
  const response = await fetch(`${API_BASE}/mechs/parseBuild`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  const parsed = await parseResponse<ParsedMechBuild>(response);
  return parsed.data;
}
