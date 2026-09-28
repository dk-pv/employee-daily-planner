import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";
import { prisma } from "./db";
import { hashPassword, verifyPassword } from "./password";

export { hashPassword, verifyPassword };

const SESSION_COOKIE = "edp_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // one working day

// Used when the email doesn't exist, so response time doesn't reveal which emails have accounts.
const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));
export async function burnPasswordCheck(password: string) {
  await verifyPassword(password, await DUMMY_HASH);
}

// ---------------------------------------------------------------------------
// Sessions: random token in an HTTP-only cookie, SHA-256 of it in the database.
// ---------------------------------------------------------------------------

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Starts a session for a user whose password was just verified against `user.passwordHash`.
 * Returns false if a password reset or deactivation committed while the login was in flight:
 * either this re-read sees it, or that request's revokeSessions() runs after our insert and deletes it.
 */
export async function createSession(user: { id: string; passwordHash: string }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const session = await prisma.session.create({ data: { tokenHash: sha256(token), userId: user.id, expiresAt } });
  const current = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, isActive: true } });
  if (!current?.isActive || current.passwordHash !== user.passwordHash) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return false;
  }
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return true;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  store.delete(SESSION_COOKIE);
}

/** Signs a user out everywhere — except the caller's own current session (e.g. changing your own password). */
export async function revokeSessions(userId: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await prisma.session.deleteMany({
    where: { userId, ...(token ? { NOT: { tokenHash: sha256(token) } } : {}) },
  });
}

/** Every user field that is safe to send to the browser (never passwordHash). */
export const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  department: true,
  isActive: true,
  createdAt: true,
} as const;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "STAFF" | "ADMIN";
  department: "SALES" | "DEVELOPMENT" | "MARKETING" | null;
};

/** The signed-in user, read fresh from the database on every request (never from the client). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      expiresAt: true,
      user: { select: { id: true, name: true, email: true, role: true, department: true, isActive: true } },
    },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;
  const { id, name, email, role, department } = session.user;
  return { id, name, email, role, department };
});

// ---------------------------------------------------------------------------
// Page guards (Server Components)
// ---------------------------------------------------------------------------

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireStaff() {
  const user = await requireUser();
  if (user.role !== "STAFF") redirect("/admin");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/forbidden");
  return user;
}

// ---------------------------------------------------------------------------
// Route handler helpers
// ---------------------------------------------------------------------------

/**
 * Parsed JSON body, or null. Requiring an application/json content type blocks cross-site
 * HTML form posts (they can only send text/plain, urlencoded or multipart) — CSRF defence
 * on top of the SameSite=Lax session cookie.
 */
export async function readJson(request: Request): Promise<unknown> {
  // Compare the MIME type itself: "text/plain; charset=application/json" is still text/plain.
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return null;
  return request.json().catch(() => null);
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Returns the user when authorised, otherwise a ready-to-return 401/403 response. */
export async function authorizeApi(role?: SessionUser["role"]) {
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("Your session has expired. Please sign in again.", 401) };
  if (role && user.role !== role) {
    return { error: jsonError("You do not have permission to perform this action.", 403) };
  }
  return { user };
}
