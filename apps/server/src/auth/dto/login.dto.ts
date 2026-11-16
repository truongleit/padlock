import { IsBase64, IsEmail, IsIn, MaxLength } from "class-validator";

import { NormalizeEmail } from "@/common/email.util";

export const USER_CLIENT_TYPES = ["WEB", "EXTENSION"] as const;

export class LoginDto {
  @NormalizeEmail()
  @IsEmail()
  email!: string;

  @IsBase64()
  @MaxLength(256)
  authKey!: string;

  @IsIn(USER_CLIENT_TYPES)
  clientType!: (typeof USER_CLIENT_TYPES)[number];
}
