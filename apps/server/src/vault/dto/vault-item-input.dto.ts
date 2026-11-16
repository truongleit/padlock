import {
  IsBase64,
  IsInt,
  IsOptional,
  Max,
  MaxLength,
  Min,
} from "class-validator";

// One credential, encrypted on the client (AES-256-GCM). The server can't read it.
export class VaultItemInputDto {
  @IsBase64()
  @MaxLength(65_536)
  ciphertext!: string;

  /** AES-GCM nonce. Must be new on every write. */
  @IsBase64()
  @MaxLength(32)
  iv!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32_767)
  encVersion?: number;
}
