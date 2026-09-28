import type { Metadata } from "next";
import { UserManager } from "@/components/admin/UserManager";
import { requireAdmin, userSelect } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "User Management · Admin" };

export default async function UsersPage() {
  const admin = await requireAdmin();
  // userSelect never includes passwordHash.
  const users = await prisma.user.findMany({ select: userSelect, orderBy: [{ role: "asc" }, { name: "asc" }] });

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <UserManager
        currentUserId={admin.id}
        users={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
        timeZone={process.env.APP_TIMEZONE || "Asia/Kolkata"}
      />
    </div>
  );
}
