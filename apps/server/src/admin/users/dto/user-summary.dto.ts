import { PaginatedDto } from "@/common/dto/paginated.dto";
import type { AccountStatus } from "@/generated/prisma/enums";

export class UserSummaryDto {
  id!: string;
  email!: string;
  status!: AccountStatus;
  createdAt!: Date;
}

export class UserListDto extends PaginatedDto {
  data!: UserSummaryDto[];
}
