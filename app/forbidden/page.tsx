import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { btnSecondary } from "@/components/ui/ui";
import { requireUser } from "@/lib/auth";

export default async function ForbiddenPage() {
  await requireUser();
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-24">
      <div className="max-w-sm text-center">
        <p className="text-xs font-bold tracking-[0.2em] text-neutral-500">403</p>
        <h1 className="mt-2 text-lg font-semibold text-neutral-900">Access denied</h1>
        <p className="mt-2 text-sm text-neutral-600">You do not have permission to access this page.</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link href="/" className={`${btnSecondary} max-sm:min-h-10`}>
            Go to Daily Planner
          </Link>
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
