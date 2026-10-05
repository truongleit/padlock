import { PaginatedDto } from "@/common/dto/paginated.dto";
import type { AccountStatus } from "@/generated/prisma/enums";

export class AdminSummaryDto {
  id!: string;
  email!: string;
  status!: AccountStatus;
  createdAt!: Date;
  lastLoginAt!: Date | null;
}

export class AdminListDto extends PaginatedDto {
  data!: AdminSummaryDto[];
}
