// Seeds the first admin (from SEED_ADMIN_* environment variables) and the staff accounts below.
// Run with: npx prisma db seed   (idempotent — safe to run any number of times)
//  - Admin: created only if no user has that email; an existing account is never changed. Skipped when SEED_ADMIN_EMAIL is unset.
//  - Staff: matched by normalised email. Missing accounts are created; existing ones get name, role, department and
//    password reset to the values below. Admin accounts, other users and all daily reports are never touched.
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { hashPassword, verifyPassword } from "../lib/password";
import type { DepartmentValue } from "../lib/utils";
import { emailSchema } from "../lib/validations";

config({ path: ".env.local", quiet: true });

// Each password is the name in lower case + "1234" (e.g. danish1234). Only its scrypt hash is stored.
const STAFF: { name: string; email: string; department: DepartmentValue }[] = [
  { name: "Shahan", email: "shahanmukkam2002@gmail.com", department: "MARKETING" },
  { name: "Neema", email: "ayshaneema2@gmail.com", department: "DEVELOPMENT" },
  { name: "danish", email: "danish.pv999@gmail.com", department: "DEVELOPMENT" },
  { name: "fayas", email: "fayasrahman3504@gmail.com", department: "MARKETING" },
  { name: "nived", email: "nived050@gmail.com", department: "DEVELOPMENT" },
  { name: "hrithik", email: "hrithikelayur12@gmail.com", department: "DEVELOPMENT" },
  { name: "marshook", email: "marshookali98@gmail.com", department: "DEVELOPMENT" },
  { name: "rasha", email: "rashaafii2007@gmail.com", department: "DEVELOPMENT" },
  { name: "shareef", email: "shareefnncr@gmail.com", department: "DEVELOPMENT" },
  { name: "minhaj", email: "Muhammedminhaj798@gmail.com", department: "DEVELOPMENT" },
  { name: "akash", email: "akashkrishna799@gmail.com", department: "DEVELOPMENT" },
  { name: "arjun", email: "arjunptgangan411@gmail.com", department: "SALES" },
  { name: "anisha", email: "anishakudukkan2255@gmail.com", department: "SALES" },
  { name: "leaya", email: "leayamp@gmail.com", department: "HR" },
  { name: "gopika", email: "gopikagopu810@gmail.com", department: "ACCOUNTS" },
  { name: "manu", email: "manuprasad9615@gmail.com", department: "MARKETING" },
  { name: "afnan", email: "mohammedafnan8089@gmail.com", department: "MARKETING" },
  { name: "lizan", email: "lizanm944@gmail.com", department: "SALES" },
  { name: "Jaseem", email: "jaseemkoppilakath@gmail.com", department: "STUDENTS" },
  { name: "Naima", email: "naimanurin7@gmail.com", department: "STUDENTS" },
];

type Db = InstanceType<typeof PrismaClient>;

async function seedAdmin(prisma: Db) {
  if (!process.env.SEED_ADMIN_EMAIL) {
    console.log("SEED_ADMIN_EMAIL not set — skipping the admin account.");
    return;
  }
  const name = process.env.SEED_ADMIN_NAME || "Administrator";
  const email = emailSchema.safeParse(process.env.SEED_ADMIN_EMAIL);
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email.success || !password || password.length < 8) {
    throw new Error("Set SEED_ADMIN_EMAIL (a valid email) and SEED_ADMIN_PASSWORD (8+ characters) before seeding.");
  }

  const existing = await prisma.user.findUnique({ where: { email: email.data } });
  if (existing) {
    console.log(`Admin "${email.data}" already exists — nothing to do.`);
    return;
  }
  await prisma.user.create({
    data: { name, email: email.data, role: "ADMIN", passwordHash: await hashPassword(password) },
  });
  console.log(`Created admin "${email.data}".`);
}

async function seedStaff(prisma: Db) {
  const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
  for (const staff of STAFF) {
    // Same normalisation as login and User Management (trimmed, lower-case), so casing never makes a duplicate.
    const email = emailSchema.parse(staff.email);
    const password = `${staff.name.toLowerCase()}1234`;
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, role: true, department: true, passwordHash: true },
    });

    if (!existing) {
      await prisma.user.create({
        data: { name: staff.name, email, role: "STAFF", department: staff.department, passwordHash: await hashPassword(password) },
      });
      counts.created++;
      continue;
    }
    if (existing.role === "ADMIN") {
      console.warn(`Skipped "${email}": it belongs to an admin account, which the seed never changes.`);
      counts.skipped++;
      continue;
    }

    // Re-hash only when the password actually differs, so re-running the seed changes nothing.
    const passwordMatches = await verifyPassword(password, existing.passwordHash);
    if (passwordMatches && existing.name === staff.name && existing.department === staff.department) {
      counts.unchanged++;
      continue;
    }
    const passwordHash = passwordMatches ? undefined : await hashPassword(password);
    // One transaction: a password reset and signing the account out everywhere (as User Management does) happen
    // together — otherwise a failure in between would leave old sessions that the next, "up to date" run never revokes.
    await prisma.$transaction([
      prisma.user.update({
        where: { id: existing.id },
        data: { name: staff.name, role: "STAFF", department: staff.department, ...(passwordHash ? { passwordHash } : {}) },
      }),
      ...(passwordHash ? [prisma.session.deleteMany({ where: { userId: existing.id } })] : []),
    ]);
    counts.updated++;
  }
  console.log(
    `Staff accounts: ${counts.created} created, ${counts.updated} updated, ${counts.unchanged} already up to date` +
      (counts.skipped ? `, ${counts.skipped} skipped (admin accounts)` : "") +
      ".",
  );
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    await seedAdmin(prisma);
    await seedStaff(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
