import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

import { NormalizeEmail } from "@/common/email.util";

export class AdminLoginDto {
  @NormalizeEmail()
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
