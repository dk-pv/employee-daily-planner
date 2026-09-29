import { NextResponse } from "next/server";
import { authorizeApi, jsonError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { printSelection } from "@/lib/reports";

/** Admin print panel: how many reports /admin/print would print for these filters (one count query). */
export async function GET(request: Request) {
  const auth = await authorizeApi("ADMIN");
  if (auth.error) return auth.error;

  const params = new URL(request.url).searchParams;
  const selection = printSelection((key) => params.get(key));
  if ("error" in selection) return jsonError(selection.error, 400);

  const count = await prisma.dailyReport.count({ where: selection.where });
  return NextResponse.json({ count, message: count ? null : selection.empty });
}
