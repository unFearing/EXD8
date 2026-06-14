import type { HttpResponseInit } from "@azure/functions";
import type { ApiErrorCode } from "../types/api.js";

export function jsonResponse(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    jsonBody: body,
    headers: {
      "content-type": "application/json",
    },
  };
}

export function ok<T>(data: T): HttpResponseInit {
  return jsonResponse(200, { ok: true, data });
}

export function created<T>(data: T): HttpResponseInit {
  return jsonResponse(201, { ok: true, data });
}

export function fail(status: number, code: ApiErrorCode, message: string, details?: unknown): HttpResponseInit {
  return jsonResponse(status, {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  });
}
