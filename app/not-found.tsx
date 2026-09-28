import Link from "next/link";
import { btnSecondary } from "@/components/ui/ui";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-24">
      <div className="max-w-sm text-center">
        <p className="text-xs font-bold tracking-[0.2em] text-neutral-500">404</p>
        <h1 className="mt-2 text-lg font-semibold text-neutral-900">Not found</h1>
        <p className="mt-2 text-sm text-neutral-600">The page or report you are looking for does not exist.</p>
        <Link href="/" className={`${btnSecondary} mt-6`}>
          Go to home
        </Link>
      </div>
    </main>
  );
}
