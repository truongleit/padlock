import { vi } from "vitest";

const MODELS = [
  "admin",
  "session",
  "passwordResetToken",
  "user",
  "adminAuditLog",
] as const;
const METHODS = [
  "findUnique",
  "findUniqueOrThrow",
  "findMany",
  "count",
  "create",
  "update",
  "updateMany",
  "delete",
] as const;

type ModelMock = Record<(typeof METHODS)[number], ReturnType<typeof vi.fn>>;
export type PrismaMock = Record<(typeof MODELS)[number], ModelMock> & {
  $transaction: ReturnType<typeof vi.fn>;
};

/** Plain-object stand-in for PrismaService. `$transaction` hands the same mock to the callback. */
export function createPrismaMock(): PrismaMock {
  const mock = { $transaction: vi.fn() } as PrismaMock;
  for (const m of MODELS) {
    mock[m] = Object.fromEntries(METHODS.map((f) => [f, vi.fn()])) as ModelMock;
  }
  mock.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === "function" ? arg(mock) : Promise.all(arg as unknown[])
  );
  return mock;
}
