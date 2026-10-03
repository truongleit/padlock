import { Module } from "@nestjs/common";

import { AdminsController } from "@/admins/admins.controller";
import { AdminsService } from "@/admins/admins.service";

@Module({
  controllers: [AdminsController],
  providers: [AdminsService],
})
export class AdminsModule {}
