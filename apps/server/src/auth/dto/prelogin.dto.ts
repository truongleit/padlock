import { IsEmail } from "class-validator";

import { NormalizeEmail } from "@/common/email.util";

export class PreloginDto {
  @NormalizeEmail()
  @IsEmail()
  email!: string;
}
