import { Type } from "class-transformer";
import { IsDate, IsEnum, IsOptional, IsUUID } from "class-validator";

import { PaginationQueryDto } from "@/common/dto/pagination-query.dto";
import { AuditAction } from "@/generated/prisma/enums";

export class ListAuditQueryDto extends PaginationQueryDto {
  @IsEnum(AuditAction)
  @IsOptional()
  action?: AuditAction;

  @IsUUID()
  @IsOptional()
  adminId?: string;

  @IsUUID()
  @IsOptional()
  targetUserId?: string;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  from?: Date;

  @Type(() => Date)
  @IsDate()
  @IsOptional()
  to?: Date;
}
