import { IsEmail } from "class-validator";

import { UserKeysDto } from "@/auth/dto/user-keys.dto";
import { NormalizeEmail } from "@/common/email.util";

export class RegisterDto extends UserKeysDto {
  @NormalizeEmail()
  @IsEmail()
  email!: string;
}
