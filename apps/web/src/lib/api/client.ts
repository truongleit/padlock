import ky, { isHTTPError } from "ky";

import { env } from "@/env";

let accessToken: string | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token;
  },
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
