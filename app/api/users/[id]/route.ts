import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { authorizeApi, hashPassword, jsonError, readJson, revokeSessions, userSelect } from "@/lib/auth";
import { isWriteConflict, serializable } from "@/lib/db";
import { deleteConfirmationSchema, firstError, updateUserSchema } from "@/lib/validations";

/** Admin edits a user: details, role/department, activation, optional password reset. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/users/[id]">) {
  const auth = await authorizeApi("ADMIN");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const parsed = updateUserSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);
  const { password, ...fields } = parsed.data;

  // You can't lock yourself out.
  if (id === auth.user.id && (fields.role !== "ADMIN" || !fields.isActive)) {
    return jsonError("You cannot remove your own admin role or deactivate your own account.", 400);
  }
  const passwordHash = password ? await hashPassword(password) : undefined;

  try {
    // Serializable + re-checking the actor inside the transaction: two admins demoting or
    // deactivating each other at the same moment cannot both succeed, so an active admin always remains.
    const user = await serializable(async (tx) => {
      const actorIsAdmin = await tx.user.count({ where: { id: auth.user.id, role: "ADMIN", isActive: true } });
      if (!actorIsAdmin) return null;
      return tx.user.update({
        where: { id },
        data: { ...fields, ...(passwordHash ? { passwordHash } : {}) },
        select: userSelect,
      });
    });
    if (!user) return jsonError("You do not have permission to perform this action.", 403);

    // Deactivation or a password change signs the account out everywhere (except the caller's own session).
    if (!fields.isActive || passwordHash) await revokeSessions(id);
    return NextResponse.json({
      user,
      message: passwordHash ? "User updated and password reset." : "User updated successfully.",
    });
  } catch (e) {
    if (isWriteConflict(e)) return jsonError("Another change was made at the same time. Please try again.", 409);
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return jsonError("A user with that email already exists.", 409);
      if (e.code === "P2025") return jsonError("User not found.", 404);
    }
    // Technical details stay in the server log; the browser gets a plain message. A validation error would echo
    // the query (including the password hash), so only its name is logged.
    console.error("User update failed", e instanceof Prisma.PrismaClientValidationError ? e.name : e);
    return jsonError("The user could not be saved. Please try again.", 500);
  }
}

type DeleteOutcome = { status: 403 | 404 | 400; error: string } | { reportsDeleted: number };

/**
 * Admin hard-deletes a user: their sessions, their daily reports, then the user row — all in one
 * transaction, so it either fully happens or not at all.
 */
export async function DELETE(request: Request, ctx: RouteContext<"/api/users/[id]">) {
  const auth = await authorizeApi("ADMIN");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const parsed = deleteConfirmationSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);
  if (id === auth.user.id) return jsonError("You cannot delete your own account.", 400);

  try {
    // Serializable: concurrent deletes can't race past the last-admin check.
    const outcome = await serializable(async (tx): Promise<DeleteOutcome> => {
      const actorIsAdmin = await tx.user.count({ where: { id: auth.user.id, role: "ADMIN", isActive: true } });
      if (!actorIsAdmin) return { status: 403, error: "You do not have permission to perform this action." };

      const target = await tx.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
      if (!target) return { status: 404, error: "User not found." };
      if (target.role === "ADMIN" && target.isActive) {
        const activeAdmins = await tx.user.count({ where: { role: "ADMIN", isActive: true } });
        if (activeAdmins <= 1) return { status: 400, error: "Cannot delete the last active administrator." };
      }

      await tx.session.deleteMany({ where: { userId: id } });
      const reports = await tx.dailyReport.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
      return { reportsDeleted: reports.count };
    });
    if ("error" in outcome) return jsonError(outcome.error, outcome.status);
    return NextResponse.json({
      reportsDeleted: outcome.reportsDeleted,
      message: "User and associated daily reports were permanently deleted.",
    });
  } catch (e) {
    if (isWriteConflict(e)) return jsonError("Another change was made at the same time. Please try again.", 409);
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025") return jsonError("User not found.", 404);
      if (e.code === "P2003") {
        console.error("User delete blocked by a foreign key", e.code, e.meta);
        return jsonError("This user could not be deleted because other records still depend on it.", 409);
      }
    }
    // Technical details stay in the server log; the browser gets a plain message.
    console.error("User delete failed", e);
    return jsonError("The user could not be deleted. Please try again.", 500);
  }
}
