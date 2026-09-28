import { NextResponse } from "next/server";
import { authorizeApi, jsonError, readJson } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializeReport } from "@/lib/reports";
import { firstError, reviewSchema } from "@/lib/validations";

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
