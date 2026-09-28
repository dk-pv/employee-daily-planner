import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: InstanceType<typeof PrismaClient> };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

// Reuse one client across hot reloads in dev.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Postgres serialization failure / deadlock (40001 / 40P01). With the pg driver adapter it
 * surfaces as DriverAdapterError { cause.kind: "TransactionWriteConflict" } rather than P2034.
 */
export function isWriteConflict(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) return e.code === "P2034";
  return (
    e instanceof Error &&
    e.name === "DriverAdapterError" &&
    (e.cause as { kind?: string } | undefined)?.kind === "TransactionWriteConflict"
  );
}

/** Runs fn in a SERIALIZABLE transaction; conflicts are retried (up to 3 attempts), as Postgres expects. */
export async function serializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (e) {
      if (attempt >= 3 || !isWriteConflict(e)) throw e;
      // Jittered backoff so two colliding requests don't retry in lockstep.
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 30 * attempt));
    }
  }
}
