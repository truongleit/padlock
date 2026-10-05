import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

import { PaginationQueryDto } from "@/common/dto/pagination-query.dto";
import { AccountStatus } from "@/generated/prisma/enums";

export class ListQueryDto extends PaginationQueryDto {
  @IsString()
  @MaxLength(254)
  @IsOptional()
  search?: string;

  @IsEnum(AccountStatus)
  @IsOptional()
  status?: AccountStatus;
}
