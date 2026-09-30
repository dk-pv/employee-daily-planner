"use client";

import { btnPrimary } from "@/components/ui/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-24">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-neutral-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-neutral-600">
          The page could not be loaded. Please try again — if the problem continues, contact your administrator.
        </p>
        <button type="button" onClick={reset} className={`${btnPrimary} mt-6 max-sm:min-h-11`}>
          Try again
        </button>
      </div>
    </main>
  );
}
