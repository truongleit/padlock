import type {
  Admin,
  CreateAdminInput,
  UpdateAdminInput,
} from "@/features/admins/types";
import { api } from "@/lib/api/client";
import type { ListParams, Paginated } from "@/lib/api/types";

export const listAdmins = (params: ListParams = {}) =>
  api.get("admins", { searchParams: { ...params } }).json<Paginated<Admin>>();

export const getAdmin = (id: string) => api.get(`admins/${id}`).json<Admin>();

export const createAdmin = (input: CreateAdminInput) =>
  api.post("admins", { json: input }).json<Admin>();

export const updateAdmin = (id: string, input: UpdateAdminInput) =>
  api.patch(`admins/${id}`, { json: input }).json<Admin>();

export const removeAdmin = (id: string) => api.delete(`admins/${id}`);
