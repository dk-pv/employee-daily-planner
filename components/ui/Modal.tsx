"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Alert, btnDanger, btnSecondary, fieldInput, fieldLabel } from "./ui";

/** Native <dialog> kept in sync with React state (focus trap, Esc and backdrop come for free). */
export function Modal({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={labelledBy}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl bg-white p-0 shadow-xl backdrop:bg-neutral-900/40"
    >
      {children}
    </dialog>
  );
}

/**
 * Hard-delete confirmation, rendered inside <Modal labelledBy="delete-dialog-title">. The button unlocks only
 * once DELETE is typed, and the same word goes to the API, which re-checks it along with permissions.
 */
export function ConfirmDeleteDialog({
  url,
  noun,
  title,
  details,
  warning,
  confirmLabel,
  onCancel,
  onDeleted,
}: {
  url: string;
  /** "user", "report" — only for the fallback error message. */
  noun: string;
  title: string;
  details: [string, string][];
  warning: string;
  confirmLabel: string;
  onCancel: () => void;
  onDeleted: (message: string) => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = confirmation === "DELETE";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!confirmed) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `The ${noun} could not be deleted. Please try again.`);
      onDeleted(body.message);
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Network error. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 id="delete-dialog-title" className="text-base font-semibold text-red-700">
          {title}
        </h2>
      </div>
      <div className="space-y-4 px-5 py-4">
        {error && <Alert tone="error">{error}</Alert>}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-md bg-neutral-50 px-4 py-3 text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-neutral-500">{label}</dt>
              <dd className="break-words font-medium text-neutral-900">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          <p className="font-semibold">This action cannot be undone.</p>
          <p className="mt-1">{warning}</p>
        </div>
        <div>
          <label htmlFor="delete-confirmation" className={fieldLabel}>
            Type <span className="font-semibold text-neutral-900">DELETE</span> to confirm
          </label>
          <input
            id="delete-confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className={fieldInput}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
        <button type="button" onClick={onCancel} disabled={pending} className={btnSecondary}>
          Cancel
        </button>
        <button type="submit" disabled={!confirmed || pending} className={btnDanger}>
          {pending ? "Deleting…" : confirmLabel}
        </button>
      </div>
    </form>
  );
}
