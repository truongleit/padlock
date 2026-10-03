import { IsEmail, IsEnum, IsOptional } from "class-validator";

import { NormalizeEmail } from "@/common/email.util";
import { AccountStatus } from "@/generated/prisma/enums";

export class UpdateAdminDto {
  @NormalizeEmail()
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEnum(AccountStatus)
  @IsOptional()
  status?: AccountStatus;
}
