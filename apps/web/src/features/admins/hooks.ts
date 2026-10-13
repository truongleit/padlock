import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as adminsApi from "@/features/admins/api";
import type { UpdateAdminInput } from "@/features/admins/types";
import type { ListParams } from "@/lib/api/types";

export const adminKeys = {
  all: ["admins"] as const,
  list: (params: ListParams) => [...adminKeys.all, "list", params] as const,
  detail: (id: string) => [...adminKeys.all, "detail", id] as const,
};

export function useAdmins(params: ListParams = {}) {
  return useQuery({
    queryKey: adminKeys.list(params),
    queryFn: () => adminsApi.listAdmins(params),
    placeholderData: keepPreviousData,
  });
}

export function useAdmin(id: string) {
  return useQuery({
    queryKey: adminKeys.detail(id),
    queryFn: () => adminsApi.getAdmin(id),
  });
}

function useInvalidateAdmins() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: adminKeys.all });
}

export function useCreateAdmin() {
  const invalidate = useInvalidateAdmins();
  return useMutation({
    mutationFn: adminsApi.createAdmin,
    onSuccess: invalidate,
  });
}

export function useUpdateAdmin() {
  const invalidate = useInvalidateAdmins();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAdminInput & { id: string }) =>
      adminsApi.updateAdmin(id, input),
    onSuccess: invalidate,
  });
}

export function useRemoveAdmin() {
  const invalidate = useInvalidateAdmins();
  return useMutation({
    mutationFn: adminsApi.removeAdmin,
    onSuccess: invalidate,
  });
}
