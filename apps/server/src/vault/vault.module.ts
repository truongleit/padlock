import { Module } from "@nestjs/common";

import { AuthModule } from "@/auth/auth.module";
import { VaultController } from "@/vault/vault.controller";
import { VaultService } from "@/vault/vault.service";

@Module({
  imports: [AuthModule],
  controllers: [VaultController],
  providers: [VaultService],
})
export class VaultModule {}
