import type { User } from "@/features/users/types";
import { api } from "@/lib/api/client";
import type { ListParams, Paginated } from "@/lib/api/types";

export const listUsers = (params: ListParams = {}) =>
  api
    .get("admin/users", { searchParams: { ...params } })
    .json<Paginated<User>>();

export const disableUser = (id: string) =>
  api.patch(`admin/users/${id}/disable`);

export const reactivateUser = (id: string) =>
  api.patch(`admin/users/${id}/reactivate`);

export const removeUser = (id: string) => api.delete(`admin/users/${id}`);
