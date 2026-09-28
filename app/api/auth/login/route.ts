import { NextResponse } from "next/server";
import { burnPasswordCheck, createSession, jsonError, readJson, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { firstError, loginSchema } from "@/lib/validations";

export async function POST(request: Request) {
  // Email is normalised (trimmed, lower-cased) by the schema.
  const parsed = loginSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);
  const { email, password, portal } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await burnPasswordCheck(password);
    return jsonError("Invalid email or password.", 401);
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    return jsonError("Invalid email or password.", 401);
  }
  if (!user.isActive) {
    return jsonError("Your account has been deactivated. Please contact an administrator.", 403);
  }
  // The tab is only a hint; the stored role is what counts.
  if (portal === "ADMIN" && user.role !== "ADMIN") {
    return jsonError("This account does not have admin access. Please use the Staff tab.", 403);
  }

  if (!(await createSession(user))) return jsonError("Invalid email or password.", 401);
  return NextResponse.json({ redirectTo: user.role === "ADMIN" ? "/admin" : "/" });
}
