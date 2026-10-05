import { IsEmail } from "class-validator";

import { NormalizeEmail } from "@/common/email.util";

export class ForgotPasswordDto {
  @NormalizeEmail()
  @IsEmail()
  email!: string;
}
