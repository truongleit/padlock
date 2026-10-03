import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { normalizeEmail } from "../src/common/email.util.js";
import { hashPassword } from "../src/common/password.util.js";
import { PrismaClient } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"] }),
});

const rawEmail = process.env["SEED_ADMIN_EMAIL"];
const password = process.env["SEED_ADMIN_PASSWORD"];
if (!(rawEmail && password)) {
  throw new Error("SEED_ADMIN_* env vars required");
}
const email = normalizeEmail(rawEmail);

await prisma.admin.upsert({
  where: { email },
  update: {},
  create: {
    email,
    passwordHash: await hashPassword(password),
  },
});
await prisma.$disconnect();
