import { IsString, MaxLength, MinLength } from "class-validator";

export class ResetTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}
