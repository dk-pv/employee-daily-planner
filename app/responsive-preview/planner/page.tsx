// TEMPORARY responsive-verification route (no auth, mock data). Delete the responsive-preview folder before committing.
import { PlannerForm } from "@/components/planner/PlannerForm";
import { employee, filledReport } from "../mock";

export default async function PlannerPreview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { view = "staff" } = await searchParams;
  const common = { employee, date: "2026-09-30", timeZone: "Asia/Kolkata" };

  if (view === "print") {
    return (
      <div className="print-batch">
        <div className="print-page">
          <PlannerForm mode="print" report={filledReport} lockReason={null} {...common} />
        </div>
      </div>
    );
  }
  return (
    <main className="flex-1">
      {view === "admin" && <PlannerForm mode="admin" report={filledReport} lockReason={null} {...common} />}
      {view === "staff" && <PlannerForm mode="staff" report={filledReport} lockReason={null} {...common} />}
      {view === "submitted" && (
        <PlannerForm mode="staff" report={{ ...filledReport, status: "SUBMITTED" }} lockReason={null} {...common} />
      )}
      {view === "empty" && <PlannerForm mode="staff" report={null} lockReason={null} {...common} />}
      {view === "locked" && (
        <PlannerForm
          mode="staff"
          report={filledReport}
          lockReason="Your editing period has ended. Reports can only be edited for 7 days after the report date."
          {...common}
        />
      )}
    </main>
  );
}
