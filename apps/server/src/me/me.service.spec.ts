import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hashPassword } from "@/common/password.util";
import { MeService } from "@/me/me.service";
import { createPrismaMock, type PrismaMock } from "@/test/prisma-mock";

const CURRENT = Buffer.from("current-key").toString("base64");
const DTO = {
  currentAuthKey: CURRENT,
  authKey: Buffer.from("new-key").toString("base64"),
  kdfSalt: "AAAA",
  kdfParams: { alg: "PBKDF2-SHA256", iterations: 600_000 },
  wrappedVaultKeyMaster: "AAAA",
  wrapIvMaster: "AAAA",
};
let authHash: Uint8Array;

beforeAll(async () => {
  authHash = new Uint8Array(Buffer.from(await hashPassword(CURRENT)));
});

describe("MeService", () => {
  let prisma: PrismaMock;
  let svc: MeService;

  beforeEach(() => {
    prisma = createPrismaMock();
    svc = new MeService(prisma as never);
    prisma.user.findUniqueOrThrow.mockResolvedValue({ authHash });
  });

  describe("changeMasterPassword", () => {
    it("rejects a wrong current key without changing anything", async () => {
      await expect(
        svc.changeMasterPassword("u1", { ...DTO, currentAuthKey: "d3Jvbmc=" })
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("re-wraps the master key only and revokes every session", async () => {
      await svc.changeMasterPassword("u1", DTO);
      const { data } = prisma.user.update.mock.calls[0]?.[0] ?? {};
      expect(Object.keys(data).sort()).toEqual(
        [
          "authHash",
          "kdfParams",
          "kdfSalt",
          "wrapIvMaster",
          "wrappedVaultKeyMaster",
        ].sort()
      );
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: "u1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  it("revokeSession 404s for another user's session", async () => {
    prisma.session.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.revokeSession("u1", "s2")).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(prisma.session.updateMany.mock.calls[0]?.[0].where).toMatchObject({
      id: "s2",
      userId: "u1",
    });
  });
});
