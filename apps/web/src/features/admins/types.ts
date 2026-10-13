import type { AccountStatus } from "@/lib/api/types";

export interface Admin {
  id: string;
  email: string;
  status: AccountStatus;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CreateAdminInput {
  email: string;
  password: string;
}

export interface UpdateAdminInput {
  email?: string;
  status?: AccountStatus;
}
