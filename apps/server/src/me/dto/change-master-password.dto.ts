import { PickType } from "@nestjs/swagger";
import { IsBase64, MaxLength } from "class-validator";

import { UserKeysDto } from "@/auth/dto/user-keys.dto";

// Re-wrap only (FR-11.2): the vault key and the recovery wrap stay the same.
export class ChangeMasterPasswordDto extends PickType(UserKeysDto, [
  "authKey",
  "kdfSalt",
  "kdfParams",
  "wrappedVaultKeyMaster",
  "wrapIvMaster",
] as const) {
  /** Auth key derived from the current master password. */
  @IsBase64()
  @MaxLength(256)
  currentAuthKey!: string;
}
