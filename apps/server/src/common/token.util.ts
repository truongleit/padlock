import { createHash, randomBytes } from "node:crypto";

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

// Copying into a Uint8Array keeps Prisma's Bytes type happy
export function hashToken(token: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHash("sha256").update(token).digest());
}
