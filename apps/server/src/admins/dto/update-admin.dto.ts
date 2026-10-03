import { Transform } from "class-transformer";
import { IsEmail, IsEnum, IsOptional } from "class-validator";

import { AccountStatus } from "@/generated/prisma/enums";

export class UpdateAdminDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value
  )
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEnum(AccountStatus)
  @IsOptional()
  status?: AccountStatus;
}
