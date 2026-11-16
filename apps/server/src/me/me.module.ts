import { Module } from "@nestjs/common";

import { AuthModule } from "@/auth/auth.module";
import { MeController } from "@/me/me.controller";
import { MeService } from "@/me/me.service";

@Module({
  imports: [AuthModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
