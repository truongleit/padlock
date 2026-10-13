import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, type JwtSignOptions } from "@nestjs/jwt";

import { AdminAuditLogController } from "@/admin/audit/admin-audit.controller";
import { AdminAuditLogService } from "@/admin/audit/admin-audit.service";
import { AdminAuthController } from "@/admin/auth/admin-auth.controller";
import { AdminAuthService } from "@/admin/auth/admin-auth.service";
import { AdminJwtGuard } from "@/admin/auth/admin-jwt.guard";
import { AdminUsersController } from "@/admin/users/admin-users.controller";
import { AdminUsersService } from "@/admin/users/admin-users.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("ADMIN_JWT_SECRET"),
        signOptions: {
          expiresIn: config.getOrThrow<string>(
            "ADMIN_JWT_EXPIRES_IN"
          ) as JwtSignOptions["expiresIn"],
        },
      }),
    }),
  ],
  controllers: [
    AdminAuthController,
    AdminUsersController,
    AdminAuditLogController,
  ],
  providers: [
    AdminAuthService,
    AdminJwtGuard,
    AdminUsersService,
    AdminAuditLogService,
  ],
  exports: [JwtModule, AdminJwtGuard],
})
export class AdminModule {}
