import { NextResponse } from "next/server";
import { authorizeApi, jsonError, readJson } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeReport } from "@/lib/reports";
import { deleteConfirmationSchema, firstError, reviewSchema } from "@/lib/validations";

/** Admin review: Manager Note + Performance Index. Only admins reach the update. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/reports/[id]">) {
  const auth = await authorizeApi("ADMIN");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const parsed = reviewSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);

  const current = await prisma.dailyReport.findUnique({ where: { id }, select: { updatedAt: true } });
  if (!current) return jsonError("Report not found.", 404);

  const report = await prisma.dailyReport.update({
    where: { id },
    // Keep updatedAt as the employee's last edit; the review has its own timestamp.
    data: { ...parsed.data, reviewedAt: new Date(), updatedAt: current.updatedAt },
  });
  return NextResponse.json({ report: serializeReport(report), message: "Review saved successfully." });
}

/**
 * Admin hard-deletes one daily report. All planner data lives in the report row itself, so this
 * removes it completely; the employee's account and their other reports are untouched.
 */
export async function DELETE(request: Request, ctx: RouteContext<"/api/reports/[id]">) {
  const auth = await authorizeApi("ADMIN");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const parsed = deleteConfirmationSchema.safeParse(await readJson(request));
  if (!parsed.success) return jsonError(firstError(parsed.error), 400);

  try {
    const { count } = await prisma.dailyReport.deleteMany({ where: { id } });
    if (!count) return jsonError("Report not found.", 404);
    return NextResponse.json({ message: "Daily report deleted successfully." });
  } catch (e) {
    // Technical details stay in the server log; the browser gets a plain message.
    console.error("Report delete failed", e);
    return jsonError("The report could not be deleted. Please try again.", 500);
  }
}
