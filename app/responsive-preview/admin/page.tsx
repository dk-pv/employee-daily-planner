// TEMPORARY responsive-verification route (no auth, mock data). Delete the responsive-preview folder before committing.
import { ReportFilters } from "@/components/admin/ReportFilters";
import { PrintReports } from "@/components/admin/ReportPrint";
import { UserManager } from "@/components/admin/UserManager";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { users } from "../mock";

export default async function AdminPreview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { view = "users" } = await searchParams;
  const staff = users.filter((u) => u.role === "STAFF");
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <AdminTabs />
      </div>
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
        {view === "users" && <UserManager users={users} currentUserId="u-admin" timeZone="Asia/Kolkata" />}
        {view === "filters" && (
          <>
            <ReportFilters
              initial={{ q: "", staff: "", dept: "", status: "", period: "range", date: "", from: "2026-09-01", to: "2026-09-30" }}
              staff={staff}
            />
            <PrintReports today="2026-09-30" staff={staff} />
          </>
        )}
      </div>
    </main>
  );
}
