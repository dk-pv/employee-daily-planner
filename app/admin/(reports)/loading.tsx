export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-6 w-48 animate-pulse rounded bg-neutral-200" />
      <div className="h-24 animate-pulse rounded-lg bg-neutral-200/70" />
      <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-neutral-100" />
        ))}
      </div>
    </div>
  );
}
