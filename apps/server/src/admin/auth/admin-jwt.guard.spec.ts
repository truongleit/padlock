import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminJwtGuard, type AdminRequest } from "@/admin/auth/admin-jwt.guard";
import { createPrismaMock, type PrismaMock } from "@/test/prisma-mock";

describe("AdminJwtGuard", () => {
  const jwt = new JwtService({ secret: "s".repeat(32) });
  let prisma: PrismaMock;
  let isPublic: boolean;
  let guard: AdminJwtGuard;

  const run = (authorization?: string) => {
    const req = { headers: { authorization } } as AdminRequest;
    const ctx = {
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { req, result: guard.canActivate(ctx) };
  };

  const bearer = async (payload: object) =>
    `Bearer ${await jwt.signAsync(payload)}`;

  beforeEach(() => {
    prisma = createPrismaMock();
    isPublic = false;
    const reflector = {
      getAllAndOverride: vi.fn(() => isPublic),
    } as unknown as Reflector;
    guard = new AdminJwtGuard(jwt, prisma as never, reflector);
  });

  it("lets @Public routes through without a token", async () => {
    isPublic = true;
    await expect(run().result).resolves.toBe(true);
    expect(prisma.admin.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["missing header", undefined],
    ["wrong scheme", "Basic abc"],
    ["empty bearer", "Bearer"],
    ["garbage token", "Bearer not.a.jwt"],
  ])("rejects %s", async (_n, header) => {
    await expect(run(header).result).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it("rejects a token signed with another secret", async () => {
    const other = new JwtService({ secret: "o".repeat(32) });
    const t = await other.signAsync({ sub: "a1", role: "admin" });
    await expect(run(`Bearer ${t}`).result).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it("rejects a non-admin role and a missing/non-string sub", async () => {
    for (const payload of [
      { sub: "a1", role: "user" },
      { sub: "a1" },
      { role: "admin" },
      { sub: 7, role: "admin" },
    ]) {
      await expect(run(await bearer(payload)).result).rejects.toBeInstanceOf(
        UnauthorizedException
      );
    }
    expect(prisma.admin.findUnique).not.toHaveBeenCalled();
  });

  it("rejects when the admin is deleted or no longer ACTIVE", async () => {
    const auth = await bearer({ sub: "a1", role: "admin" });
    prisma.admin.findUnique.mockResolvedValueOnce(null);
    await expect(run(auth).result).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    prisma.admin.findUnique.mockResolvedValueOnce({
      id: "a1",
      email: "a@x.test",
      status: "DISABLED",
    });
    await expect(run(auth).result).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it("accepts an active admin and attaches it to the request", async () => {
    prisma.admin.findUnique.mockResolvedValue({
      id: "a1",
      email: "a@x.test",
      status: "ACTIVE",
    });
    const { req, result } = run(await bearer({ sub: "a1", role: "admin" }));
    await expect(result).resolves.toBe(true);
    expect(req.admin).toEqual({ id: "a1", email: "a@x.test" });
  });
});
