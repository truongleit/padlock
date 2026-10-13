import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { AccountStatus } from "@/generated/prisma/enums";

export class ListQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit = 20;

  @IsString()
  @MaxLength(254)
  @IsOptional()
  search?: string;

  @IsEnum(AccountStatus)
  @IsOptional()
  status?: AccountStatus;
}
