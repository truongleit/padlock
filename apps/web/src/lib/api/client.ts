import ky, { isHTTPError } from "ky";

import { env } from "@/env";

let accessToken: string | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token;
  },
};

let onAuthLost: () => void = () => {};
export const setAuthLostHandler = (fn: () => void) => {
  onAuthLost = fn;
};

// Single-flight: the server rotates the refresh cookie, so parallel
// refreshes would invalidate each other.
let refreshing: Promise<string | null> | null = null;
const refreshAccessToken = () => {
  refreshing ??= ky
    .post("admin/auth/refresh", { baseUrl: env.apiUrl, credentials: "include" })
    .json<{ accessToken: string }>()
    .then(({ accessToken: t }) => {
      tokenStore.set(t);
      return t;
    })
    .catch(() => {
      tokenStore.set(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
};

export const api = ky.create({
  baseUrl: env.apiUrl,
  credentials: "include",
  hooks: {
    beforeRequest: [
      ({ request }) => {
        const token = tokenStore.get();
        if (token) request.headers.set("Authorization", `Bearer ${token}`);
      },
    ],
    afterResponse: [
      async ({ request, response, retryCount }) => {
        if (
          response.status !== 401 ||
          retryCount > 0 ||
          new URL(request.url).pathname.includes("/admin/auth/")
        ) {
          return;
        }
        if (await refreshAccessToken()) return ky.retry();
        onAuthLost();
      },
    ],
    beforeRetry: [
      ({ request }) => {
        const token = tokenStore.get();
        if (token) request.headers.set("Authorization", `Bearer ${token}`);
      },
    ],
    // Surface the server's `{ message }` error body as the error message.
    beforeError: [
      ({ error }) => {
        if (isHTTPError(error)) {
          const data = error.data as { message?: unknown } | undefined;
          if (typeof data?.message === "string") error.message = data.message;
        }
        return error;
      },
    ],
  },
});
