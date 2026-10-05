import type {
  AccessToken,
  LoginInput,
  ResetPasswordInput,
  Session,
} from "@/features/auth/types";
import { api } from "@/lib/api/client";

export const login = (input: LoginInput) =>
  api.post("admin/auth/login", { json: input }).json<AccessToken>();

export const refresh = () => api.post("admin/auth/refresh").json<AccessToken>();

export const logout = () => api.post("admin/auth/logout");

export const me = () => api.get("admin/auth/me").json<Session>();

export const forgotPassword = (email: string) =>
  api.post("admin/auth/forgot-password", { json: { email } });

export const resetPassword = (input: ResetPasswordInput) =>
  api.post("admin/auth/reset-password", { json: input });
