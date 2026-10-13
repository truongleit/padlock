import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { AdminModule } from "@/admin/admin.module";
import { AdminJwtGuard } from "@/admin/auth/admin-jwt.guard";
import { AdminsModule } from "@/admins/admins.module";
import { AppController } from "@/app.controller";
import { AppService } from "@/app.service";
import { AllExceptionsFilter } from "@/common/errors/all-exceptions.filter";
import { validateEnv } from "@/config/env";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    AdminsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AdminJwtGuard },
  ],
})
export class AppModule {}
