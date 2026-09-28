import { AdminTabs } from "@/components/admin/AdminTabs";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  return (
    <>
      <header className="border-b border-neutral-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pt-3 sm:px-6">
          <p className="text-sm font-bold tracking-[0.12em] text-neutral-900">
            DAILY PLANNER <span className="font-medium tracking-normal text-neutral-400">· Admin</span>
          </p>
          <div className="flex items-center gap-3">
            <span className="truncate text-xs text-neutral-600">
              Signed in as <span className="font-medium text-neutral-900">{admin.name}</span>
            </span>
            <LogoutButton />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <AdminTabs />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </>
  );
}
