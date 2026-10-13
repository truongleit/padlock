import { IsString, MaxLength, MinLength } from "class-validator";

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  // Same rule as CreateAdminDto.password
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}
