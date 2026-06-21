import type {
  ApiFailure,
  ApiSuccess,
  MatchNightCreateInput,
  MatchNightDoc,
  MechDoc,
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
    throw new Error(errorMessage);
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
  const response = await fetch(`${API_BASE}/mechs/hierarchy`, {
    headers: {
      "x-team-id": "exd8",
      "x-user-role": "Pilot",
      "x-user-id": "ui-local-user",
    },
  });

  const parsed = await parseResponse<WeightClassSummary[]>(response);
  return parsed.data;
}

export async function getMechs(): Promise<MechDoc[]> {
  const response = await fetch(`${API_BASE}/mechs`, {
    headers: {
      "x-team-id": "exd8",
      "x-user-role": "Pilot",
      "x-user-id": "ui-local-user",
    },
  });

  const parsed = await parseResponse<MechDoc[]>(response);
  return parsed.data;
}
