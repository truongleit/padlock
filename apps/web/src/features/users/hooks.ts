import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as usersApi from "@/features/users/api";
import type { ListParams } from "@/lib/api/types";

export const userKeys = {
  all: ["users"] as const,
  list: (params: ListParams) => [...userKeys.all, "list", params] as const,
};

export function useUsers(params: ListParams = {}) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: () => usersApi.listUsers(params),
    placeholderData: keepPreviousData,
  });
}

function useUserMutation(mutationFn: (id: string) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export const useDisableUser = () => useUserMutation(usersApi.disableUser);
export const useReactivateUser = () => useUserMutation(usersApi.reactivateUser);
export const useRemoveUser = () => useUserMutation(usersApi.removeUser);
