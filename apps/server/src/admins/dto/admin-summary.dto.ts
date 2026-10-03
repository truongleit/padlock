import type { AccountStatus } from "@/generated/prisma/enums";

export class AdminSummaryDto {
  id!: string;
  email!: string;
  status!: AccountStatus;
  createdAt!: Date;
  lastLoginAt!: Date | null;
}

export class AdminListDto {
  data!: AdminSummaryDto[];
  page!: number;
  limit!: number;
  total!: number;
}
