// Bytes cross the API as base64 strings. Copying into a Uint8Array keeps
// Prisma's Bytes type happy (see token.util.ts).
export function fromB64(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(value, "base64"));
}

export function toB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
