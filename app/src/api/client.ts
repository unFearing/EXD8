import type {
  ApiFailure,
  ApiSuccess,
  CreateMechInput,
  DropDeckDoc,
  DropDeckUpsertInput,
  QuickslotDoc,
  QuickslotOverviewSelectionInput,
  QuickslotUpsertInput,
  MatchNightCreateInput,
  MatchNightDoc,
  MapConfigDoc,
  MechDoc,
  ParsedMechBuild,
  PresenceDoc,
  PresenceListResponse,
  PresenceUpdateInput,
  WeightClassSummary,
} from "../types/contracts";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

function getAuthHeaders(teamId = "EXD8"): Record<string, string> {
  return { "x-team-id": teamId };
}

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
      ...getAuthHeaders(input.teamId),
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseResponse<MatchNightDoc>(response);
  return parsed.data;
}

export async function getMatchNightById(id: string, teamId: string): Promise<MatchNightDoc> {
  const response = await fetch(`${API_BASE}/matchNights/${encodeURIComponent(id)}?teamId=${encodeURIComponent(teamId)}`, {
    headers: getAuthHeaders(teamId),
  });

  const parsed = await parseResponse<MatchNightDoc>(response);
  return parsed.data;
}

export async function getMechHierarchy(): Promise<WeightClassSummary[]> {
  const response = await fetch(`${API_BASE}/mechs/hierarchy`, { headers: getAuthHeaders() });

  const parsed = await parseResponse<WeightClassSummary[]>(response);
  return parsed.data;
}

export async function getMechs(): Promise<MechDoc[]> {
  const response = await fetch(`${API_BASE}/mechs`, { headers: getAuthHeaders() });

  const parsed = await parseResponse<MechDoc[]>(response);
  return parsed.data;
}

export async function getDropDecks(): Promise<DropDeckDoc[]> {
  const response = await fetch(`${API_BASE}/decks`, { headers: getAuthHeaders() });

  const parsed = await parseResponse<DropDeckDoc[]>(response);
  return parsed.data;
}

export async function getPresence(): Promise<PresenceDoc[]> {
  const response = await fetch(`${API_BASE}/presence`, { headers: getAuthHeaders() });
  const parsed = await parseResponse<PresenceListResponse>(response);
  return parsed.data.presence;
}

export async function updateMyPresence(input: PresenceUpdateInput, keepalive = false): Promise<PresenceDoc> {
  const response = await fetch(`${API_BASE}/presence/me`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
    keepalive,
  });
  const parsed = await parseResponse<PresenceDoc>(response);
  return parsed.data;
}

export async function getMapConfigs(): Promise<MapConfigDoc[]> {
  const response = await fetch(`${API_BASE}/config/maps`, { headers: getAuthHeaders() });

  const parsed = await parseResponse<MapConfigDoc[]>(response);
  return parsed.data;
}

export async function getMechRoles(): Promise<string[]> {
  const response = await fetch(`${API_BASE}/config/mech-roles`, { headers: getAuthHeaders() });
  const parsed = await parseResponse<string[]>(response);
  return parsed.data;
}

export async function saveMapConfig(input: { name: string; imageUrl: string; maproomUrl: string }): Promise<MapConfigDoc> {
  const response = await fetch(`${API_BASE}/config/maps`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseResponse<MapConfigDoc>(response);
  return parsed.data;
}

export async function saveDropDeck(input: DropDeckUpsertInput): Promise<DropDeckDoc> {
  const response = await fetch(`${API_BASE}/decks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseResponse<DropDeckDoc>(response);
  return parsed.data;
}

export async function deleteDropDeck(id: string): Promise<{ id: string; deleted: true }> {
  const response = await fetch(`${API_BASE}/decks/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  const parsed = await parseResponse<{ id: string; deleted: true }>(response);
  return parsed.data;
}

export async function getQuickslots(id = "quickslots-default"): Promise<QuickslotDoc> {
  const response = await fetch(`${API_BASE}/quickslots?id=${encodeURIComponent(id)}`, { headers: getAuthHeaders() });
  const parsed = await parseResponse<QuickslotDoc>(response);
  return parsed.data;
}

export async function saveQuickslots(input: QuickslotUpsertInput): Promise<QuickslotDoc> {
  const response = await fetch(`${API_BASE}/quickslots`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseResponse<QuickslotDoc>(response);
  return parsed.data;
}

export async function saveQuickslotOverviewSelection(
  input: QuickslotOverviewSelectionInput,
): Promise<QuickslotDoc> {
  const response = await fetch(`${API_BASE}/quickslots/overview-selection`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseResponse<QuickslotDoc>(response);
  return parsed.data;
}

export async function createMech(input: CreateMechInput): Promise<MechDoc> {
  const response = await fetch(`${API_BASE}/mechs`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseResponse<MechDoc>(response);
  return parsed.data;
}

export async function deleteMech(id: string): Promise<{ id: string; deleted: true }> {
  const response = await fetch(`${API_BASE}/mechs/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  const parsed = await parseResponse<{ id: string; deleted: true }>(response);
  return parsed.data;
}

export async function updateMech(id: string, input: MechDoc): Promise<MechDoc> {
  const response = await fetch(`${API_BASE}/mechs/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...getAuthHeaders(),
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
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ url }),
  });

  const parsed = await parseResponse<ParsedMechBuild>(response);
  return parsed.data;
}

export async function checkMechLink(url: string): Promise<{ exists: boolean; mechId?: string; chassis?: string; variant?: string }> {
  const response = await fetch(`${API_BASE}/mechs/checkLink?url=${encodeURIComponent(url)}`, { headers: getAuthHeaders() });
  const parsed = await parseResponse<{ exists: boolean; mechId?: string; chassis?: string; variant?: string }>(response);
  return parsed.data;
}
