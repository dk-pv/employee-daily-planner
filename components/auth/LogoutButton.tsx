import { btnSecondary } from "@/components/ui/ui";

/** Plain form POST: the server deletes the session and redirects to /login. */
export function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="post" className="print:hidden">
      <button type="submit" className={`${btnSecondary} px-3 py-1.5 text-xs`}>
        Logout
      </button>
    </form>
  );
}
