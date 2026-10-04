import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, type JwtSignOptions } from "@nestjs/jwt";

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
  controllers: [AdminAuthController, AdminUsersController],
  providers: [AdminAuthService, AdminJwtGuard, AdminUsersService],
  exports: [JwtModule, AdminJwtGuard],
})
export class AdminModule {}
