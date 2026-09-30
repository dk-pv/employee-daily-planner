"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { ConfirmDeleteDialog, Modal } from "@/components/ui/Modal";
import { Alert, btnDangerSubtle } from "@/components/ui/ui";

type Target = { id: string; employee: string; email: string; date: string };

const OpenDelete = createContext<(target: Target) => void>(() => {});

/**
 * Wraps the server-rendered report list: owns the one delete dialog and the success notice,
 * which must outlive the deleted row once the refreshed list arrives.
 */
export function ReportDeletion({ previousPageHref, children }: { previousPageHref?: string; children: ReactNode }) {
  const router = useRouter();
  const [target, setTarget] = useState<Target | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // The deleted row's button (where focus would return) is gone, so move focus to the notice, which also reads it out.
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  return (
    <OpenDelete
      value={(t) => {
        setNotice(null);
        setTarget(t);
      }}
    >
      {notice && (
        <div ref={noticeRef} tabIndex={-1} className="outline-none">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      {children}
      <Modal open={target !== null} onClose={() => setTarget(null)} labelledBy="delete-dialog-title">
        {target && (
          <ConfirmDeleteDialog
            key={target.id}
            url={`/api/reports/${target.id}`}
            noun="report"
            title="Delete Daily Report?"
            details={[
              ["Employee", target.employee],
              ["Email", target.email],
              ["Date", target.date],
            ]}
            warning="This will permanently delete this employee's daily report. The employee's account and other reports are not affected."
            confirmLabel="Delete Report"
            onCancel={() => setTarget(null)}
            onDeleted={(message) =>
              // One transition: the dialog stays on "Deleting…" until the refreshed list (without the row) is shown.
              startTransition(() => {
                // Only close this report's dialog, not one opened for another report while the request was in flight.
                setTarget((t) => (t?.id === target.id ? null : t));
                setNotice(message);
                if (previousPageHref) router.replace(previousPageHref);
                else router.refresh();
              })
            }
          />
        )}
      </Modal>
    </OpenDelete>
  );
}

export function DeleteReportButton({ className = "px-3 py-1.5 text-xs", ...target }: Target & { className?: string }) {
  const open = use(OpenDelete);
  return (
    <button type="button" onClick={() => open(target)} className={`${btnDangerSubtle} ${className}`}>
      Delete
    </button>
  );
}
