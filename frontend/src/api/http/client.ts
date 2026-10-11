// fetch wrapper: base URL, bearer token, zod validation, and every failure mapped to ApiError.
import type { z } from "zod";
import { env } from "@/config/env";
import { ApiError, toApiError } from "../errors";

type TokenSource = () => string | null;

/** Called when the backend rejects the stored token mid-session (features/auth › expireSession). */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(f: (() => void) | null): void { onUnauthorized = f; }

/** A request that hasn't answered by then is given up on, like no network: M2 offers the retry. */
const REQUEST_TIMEOUT_MS = 15_000;

export interface HttpClient {
  get<S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>>;
  post<S extends z.ZodType>(path: string, body: unknown, schema: S): Promise<z.output<S>>;
  put<S extends z.ZodType>(path: string, body: unknown, schema: S): Promise<z.output<S>>;
  /** POST that returns no body (204). */
  send(path: string, body: unknown): Promise<void>;
}

export function createHttpClient(getToken: TokenSource, baseUrl = env.apiUrl, fetchImpl: typeof fetch = fetch, timeoutMs = REQUEST_TIMEOUT_MS): HttpClient {
  async function request(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<unknown> {
    const token = getToken();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    let res: Response;
    let raw: string;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: abort.signal,
      });
      raw = await res.text();
    } catch (e) {
      // fetch only rejects when the request never got a whole response: no network, DNS, refused, or
      // our own timeout.
      const why = abort.signal.aborted ? `No answer after ${timeoutMs / 1000} s` : e instanceof Error ? e.message : String(e);
      throw new ApiError("OFFLINE", why, 0, true);
    } finally {
      clearTimeout(timer);
    }
    let data: unknown = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    // 401 with a token we sent: it expired or was revoked (not sign-in's own routes, where 401 is a bad signature).
    if (res.status === 401 && token && !path.startsWith("/api/auth/")) onUnauthorized?.();
    if (!res.ok) throw toApiError(`${method} ${path.split("?")[0]}`, res.status, data);
    return data;
  }

  function parse<S extends z.ZodType>(path: string, schema: S, data: unknown): z.output<S> {
    const r = schema.safeParse(data);
    if (!r.success) throw new ApiError("SERVER", `Unexpected response from ${path}: ${r.error.message}`);
    return r.data;
  }

  return {
    get: async (path, schema) => parse(path, schema, await request("GET", path)),
    post: async (path, body, schema) => parse(path, schema, await request("POST", path, body)),
    put: async (path, body, schema) => parse(path, schema, await request("PUT", path, body)),
    send: async (path, body) => { await request("POST", path, body); },
  };
}
