import { IsString, MaxLength, MinLength } from "class-validator";

import { UserKeysDto } from "@/auth/dto/user-keys.dto";

export class ResetPasswordDto extends UserKeysDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}
