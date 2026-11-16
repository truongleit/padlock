import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";

import { createPrismaMock, type PrismaMock } from "@/test/prisma-mock";
import { VaultService } from "@/vault/vault.service";

const IV = Buffer.alloc(12, 7).toString("base64");

describe("VaultService", () => {
  let prisma: PrismaMock;
  let svc: VaultService;

  beforeEach(() => {
    prisma = createPrismaMock();
    svc = new VaultService(prisma as never);
  });

  it("returns items with base64 bytes", async () => {
    prisma.vaultItem.findMany.mockResolvedValue([
      {
        id: "i1",
        ciphertext: new Uint8Array([1, 2, 3]),
        iv: new Uint8Array([4, 5]),
        encVersion: 1,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ]);
    const [item] = await svc.list("u1");
    expect(item).toMatchObject({ ciphertext: "AQID", iv: "BAU=" });
    expect(prisma.vaultItem.findMany.mock.calls[0]?.[0].where).toEqual({
      userId: "u1",
    });
  });

  describe("replace", () => {
    it("404s when the item belongs to someone else", async () => {
      prisma.vaultItem.findFirst.mockResolvedValue(null);
      await expect(
        svc.replace("u1", "i1", { ciphertext: "AQID", iv: IV })
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.vaultItem.findFirst.mock.calls[0]?.[0].where).toEqual({
        id: "i1",
        userId: "u1",
      });
    });

    it("rejects a reused IV", async () => {
      prisma.vaultItem.findFirst.mockResolvedValue({
        iv: new Uint8Array(Buffer.from(IV, "base64")),
      });
      await expect(
        svc.replace("u1", "i1", { ciphertext: "AQID", iv: IV })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.vaultItem.update).not.toHaveBeenCalled();
    });
  });

  it("remove 404s when nothing of this user's was deleted", async () => {
    prisma.vaultItem.deleteMany.mockResolvedValue({ count: 0 });
    await expect(svc.remove("u1", "i1")).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(prisma.vaultItem.deleteMany).toHaveBeenCalledWith({
      where: { id: "i1", userId: "u1" },
    });
  });
});
