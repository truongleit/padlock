import { Equals } from "class-validator";

import { ResetPasswordDto } from "@/auth/dto/reset-password.dto";

// FR-1.7: master password and recovery key both lost. Deletes the whole vault.
export class ResetAccountDto extends ResetPasswordDto {
  /** Must be true: the user confirmed that every vault item is deleted. */
  @Equals(true)
  confirm!: boolean;
}
