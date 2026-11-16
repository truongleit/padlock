import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

// Bounds match the extension's settings page.
export class GeneratorDefaultsDto {
  @IsInt()
  @Min(8)
  @Max(64)
  length!: number;

  @IsBoolean()
  symbols!: boolean;

  @IsBoolean()
  numbers!: boolean;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  autoLockMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(300)
  clipboardClearSeconds?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeneratorDefaultsDto)
  generatorDefaults?: GeneratorDefaultsDto;
}
