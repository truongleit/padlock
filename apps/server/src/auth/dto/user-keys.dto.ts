import { ApiProperty } from "@nestjs/swagger";
import { IsBase64, IsObject, MaxLength } from "class-validator";

// Everything the client derives from the master password and recovery key.
// Byte fields are base64. The server never sees the master password or recovery key.
export class UserKeysDto {
  /** Key the client derives from the master password for login only. Hashed again with Argon2 here. */
  @IsBase64()
  @MaxLength(256)
  authKey!: string;

  @IsBase64()
  @MaxLength(256)
  kdfSalt!: string;

  /** Opaque KDF settings, e.g. { alg: "PBKDF2-SHA256", iterations: 600000 }. */
  @ApiProperty({ type: "object", additionalProperties: true })
  @IsObject()
  kdfParams!: Record<string, unknown>;

  @IsBase64()
  @MaxLength(256)
  wrappedVaultKeyMaster!: string;

  @IsBase64()
  @MaxLength(256)
  wrapIvMaster!: string;

  @IsBase64()
  @MaxLength(256)
  wrappedVaultKeyRecovery!: string;

  @IsBase64()
  @MaxLength(256)
  wrapIvRecovery!: string;
}
