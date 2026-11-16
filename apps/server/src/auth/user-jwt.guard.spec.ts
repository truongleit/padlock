import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { beforeEach, describe, expect, it } from "vitest";

import { UserJwtGuard } from "@/auth/user-jwt.guard";
import { createPrismaMock, type PrismaMock } from "@/test/prisma-mock";

const jwt = new JwtService({ secret: "s".repeat(32) });

describe("UserJwtGuard", () => {
  let prisma: PrismaMock;
  let guard: UserJwtGuard;
  const ctx = (authorization?: string) => {
    const req = { headers: { authorization } } as Record<string, unknown>;
    return {
      req,
      ctx: { switchToHttp: () => ({ getRequest: () => req }) } as never,
    };
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    guard = new UserJwtGuard(jwt, prisma as never);
  });

  it("accepts an active user's token and sets req.user", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "u@x.test",
      status: "ACTIVE",
    });
    const token = await jwt.signAsync({ sub: "u1", role: "user" });
    const { req, ctx: c } = ctx(`Bearer ${token}`);
    await expect(guard.canActivate(c)).resolves.toBe(true);
    expect(req.user).toEqual({ id: "u1", email: "u@x.test" });
  });

  it("rejects an admin token", async () => {
    const token = await jwt.signAsync({ sub: "a1", role: "admin" });
    await expect(
      guard.canActivate(ctx(`Bearer ${token}`).ctx)
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a disabled user", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "u@x.test",
      status: "DISABLED",
    });
    const token = await jwt.signAsync({ sub: "u1", role: "user" });
    await expect(
      guard.canActivate(ctx(`Bearer ${token}`).ctx)
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a missing header", async () => {
    await expect(guard.canActivate(ctx().ctx)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });
});
