import type { MatchNightCreateInput, MatchNightDoc } from "./contracts.js";

export type ApiErrorCode = "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "TEAM_MISMATCH" | "INTERNAL";

export type ApiError = {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type CreateMatchNightRequest = MatchNightCreateInput;
export type CreateMatchNightResponse = ApiSuccess<MatchNightDoc> | ApiError;
export type GetMatchNightResponse = ApiSuccess<MatchNightDoc> | ApiError;
