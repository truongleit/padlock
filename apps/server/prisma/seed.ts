import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";

import { PrismaClient } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"] }),
});

const email = process.env["SEED_ADMIN_EMAIL"]?.toLowerCase();
const password = process.env["SEED_ADMIN_PASSWORD"];
if (!(email && password)) throw new Error("SEED_ADMIN_* env vars required");

await prisma.admin.upsert({
  where: { email },
  update: {},
  create: {
    email,
    passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
  },
});
await prisma.$disconnect();
