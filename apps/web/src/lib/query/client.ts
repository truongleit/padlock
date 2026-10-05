import { QueryClient } from "@tanstack/react-query";
import { isHTTPError } from "ky";

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
