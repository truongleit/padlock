import { QueryClient } from "@tanstack/react-query";
import { isHTTPError } from "ky";

import { authKeys } from "@/features/auth/hooks";
import { setAuthLostHandler } from "@/lib/api/client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) =>
        count < 2 && !(isHTTPError(error) && error.response.status < 500),
    },
  },
});

// Refresh failed mid-session: re-run the session query so RequireAuth redirects.
setAuthLostHandler(() => {
  void queryClient.invalidateQueries({ queryKey: authKeys.session });
});
