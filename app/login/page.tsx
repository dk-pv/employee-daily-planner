import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in · Employee Daily Planner" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : "/");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-[11px] font-bold tracking-[0.25em] text-neutral-500">EMPLOYEE</p>
          <h1 className="mt-1 text-2xl font-bold tracking-[0.12em] text-neutral-900">DAILY PLANNER</h1>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-neutral-500">
          Accounts are created by your administrator.
        </p>
      </div>
    </main>
  );
}
