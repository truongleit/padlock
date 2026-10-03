import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";

import { AdminModule } from "@/admin/admin.module";
import { AdminsModule } from "@/admins/admins.module";
import { AppController } from "@/app.controller";
import { AppService } from "@/app.service";
import { AllExceptionsFilter } from "@/common/errors/all-exceptions.filter";
import { validateEnv } from "@/config/env";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AdminsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
