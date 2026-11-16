// Padlock API client (docs/remaining_apis.md). The access token lives in storage.session,
// shared by the popup, the app page and the background; the refresh token is the
// server's HTTP-only `refresh` cookie.

const BASE_URL: string | undefined = import.meta.env.WXT_API_URL;

export const tokenStore = storage.defineItem<string | null>(
  "session:accessToken",
  { fallback: null }
);

/** Server error body: `{ statusCode, code, message }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string
  ) {
    super(message);
  }
}

function send(method: string, path: string, body?: unknown, token?: string) {
  if (!BASE_URL) throw new Error("WXT_API_URL is not set");
  return fetch(`${BASE_URL.replace(/\/$/, "")}/${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * Swaps the refresh cookie for a new access token. Single-flight across every extension
 * page: the server rotates the cookie, so two parallel refreshes would end the session.
 * `stale` is the token that just failed; if another page already replaced it, reuse theirs.
 */
export function refresh(stale: string | null): Promise<boolean> {
  return navigator.locks.request("padlock-refresh", async () => {
    const current = await tokenStore.getValue();
    if (current && current !== stale) return true;
    const res = await send("POST", "auth/refresh");
    if (!res.ok) {
      await tokenStore.removeValue();
      return false;
    }
    const { accessToken } = (await res.json()) as { accessToken: string };
    await tokenStore.setValue(accessToken);
    return true;
  });
}

/** JSON request; on a 401 outside `/auth` it refreshes once and retries. Throws ApiError. */
export async function api<T = void>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const token = (await tokenStore.getValue()) ?? undefined;
  let res = await send(method, path, body, token);
  if (
    res.status === 401 &&
    !path.startsWith("auth/") &&
    (await refresh(token ?? null))
  ) {
    res = await send(
      method,
      path,
      body,
      (await tokenStore.getValue()) ?? undefined
    );
  }
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = (data ?? {}) as { code?: unknown; message?: unknown };
    throw new ApiError(
      res.status,
      typeof err.code === "string" ? err.code : undefined,
      typeof err.message === "string" ? err.message : res.statusText
    );
  }
  return data as T;
}

/** User-facing text for a failed call: server message, or a network hint. */
export const errorText = (e: unknown, fallback: string) =>
  e instanceof ApiError
    ? e.status === 401
      ? fallback
      : e.message
    : e instanceof TypeError
      ? "Can't reach the PadLock server. Check your connection."
      : fallback;
