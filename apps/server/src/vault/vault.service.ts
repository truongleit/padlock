import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { fromB64, toB64 } from "@/common/bytes.util";
import type { VaultItem } from "@/generated/prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import type { VaultItemInputDto } from "@/vault/dto/vault-item-input.dto";

function toDto(item: VaultItem) {
  return {
    id: item.id,
    ciphertext: toB64(item.ciphertext),
    iv: toB64(item.iv),
    encVersion: item.encVersion,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

// Every query filters by userId, so a user can never touch another user's items.
@Injectable()
export class VaultService {
  constructor(private readonly prisma: PrismaService) {}

  // ponytail: full list on every sync; add `since` + delete tombstones when vaults get big
  // (hard deletes would be invisible to an incremental `since` query).
  async list(userId: string) {
    const items = await this.prisma.vaultItem.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return items.map(toDto);
  }

  async create(userId: string, dto: VaultItemInputDto) {
    const item = await this.prisma.vaultItem.create({
      data: {
        userId,
        ciphertext: fromB64(dto.ciphertext),
        iv: fromB64(dto.iv),
        encVersion: dto.encVersion,
      },
    });
    return toDto(item);
  }

  async replace(userId: string, id: string, dto: VaultItemInputDto) {
    const current = await this.prisma.vaultItem.findFirst({
      where: { id, userId },
      select: { iv: true },
    });
    if (!current) throw new NotFoundException("Item not found");
    const iv = fromB64(dto.iv);
    // Reusing a GCM nonce under the same key breaks the encryption. Only the
    // previous IV is known here; the client must still generate a fresh one each time.
    if (Buffer.from(current.iv).equals(iv)) {
      throw new BadRequestException("iv must be new on every write");
    }
    const item = await this.prisma.vaultItem.update({
      where: { id },
      data: {
        ciphertext: fromB64(dto.ciphertext),
        iv,
        encVersion: dto.encVersion,
      },
    });
    return toDto(item);
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.vaultItem.deleteMany({
      where: { id, userId },
    });
    if (count === 0) throw new NotFoundException("Item not found");
  }
}
