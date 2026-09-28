// Creates the first admin account from SEED_ADMIN_* environment variables.
// Run with: npx prisma db seed   (idempotent — an existing email is left untouched)
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { hashPassword } from "../lib/password";
import { emailSchema } from "../lib/validations";

config({ path: ".env.local", quiet: true });

async function main() {
  const name = process.env.SEED_ADMIN_NAME || "Administrator";
  const email = emailSchema.safeParse(process.env.SEED_ADMIN_EMAIL);
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email.success || !password || password.length < 8) {
    throw new Error("Set SEED_ADMIN_EMAIL (a valid email) and SEED_ADMIN_PASSWORD (8+ characters) before seeding.");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const existing = await prisma.user.findUnique({ where: { email: email.data } });
    if (existing) {
      console.log(`Admin "${email.data}" already exists — nothing to do.`);
      return;
    }
    await prisma.user.create({
      data: { name, email: email.data, role: "ADMIN", passwordHash: await hashPassword(password) },
    });
    console.log(`Created admin "${email.data}".`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
