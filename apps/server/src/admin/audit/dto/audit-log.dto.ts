import { PaginatedDto } from "@/common/dto/paginated.dto";
import type { AuditAction } from "@/generated/prisma/enums";

export class AuditLogDto {
  id!: string;
  adminId!: string;
  targetUserId!: string;
  action!: AuditAction;
  createdAt!: Date;
}

export class AuditListDto extends PaginatedDto {
  data!: AuditLogDto[];
}
