import type { AccountStatus } from "@/lib/api/types";

export interface User {
  id: string;
  email: string;
  status: AccountStatus;
  createdAt: string;
}
