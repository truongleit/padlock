import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as authApi from "@/features/auth/api";
import { tokenStore } from "@/lib/api/client";

export const authKeys = {
  session: ["auth", "session"] as const,
};

// The access token is memory-only, so after a reload trade the httpOnly
// refresh cookie for a new one before asking who we are.
export function useSession() {
  return useQuery({
    queryKey: authKeys.session,
    retry: false,
    queryFn: async () => {
      if (!tokenStore.get()) {
        tokenStore.set((await authApi.refresh()).accessToken);
      }
      return authApi.me();
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: ({ accessToken }) => {
      tokenStore.set(accessToken);
      return queryClient.invalidateQueries({ queryKey: authKeys.session });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      tokenStore.set(null);
      queryClient.clear();
    },
  });
}

export function useForgotPassword() {
  return useMutation({ mutationFn: authApi.forgotPassword });
}

export function useResetPassword() {
  return useMutation({ mutationFn: authApi.resetPassword });
}
