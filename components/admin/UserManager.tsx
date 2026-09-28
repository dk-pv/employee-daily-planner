"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  Alert,
  Badge,
  btnDanger,
  btnDangerSubtle,
  btnPrimary,
  btnSecondary,
  fieldInput,
  fieldLabel,
} from "@/components/ui/ui";
import { DEPARTMENT_LABELS, DEPARTMENTS, departmentLabel, formatDateTime, type DepartmentValue } from "@/lib/utils";
import { createUserSchema, updateUserSchema } from "@/lib/validations";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "STAFF" | "ADMIN";
  department: DepartmentValue | null;
  isActive: boolean;
  createdAt: string;
};

type Notice = { tone: "success" | "error"; text: string } | null;

async function saveUser(user: UserRow | null, values: object) {
  const res = await fetch(user ? `/api/users/${user.id}` : "/api/users", {
    method: user ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Could not save the user.");
  return body.message as string;
}

export function UserManager({ users, currentUserId, timeZone }: { users: UserRow[]; currentUserId: string; timeZone: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  // Hidden right away after a delete, before router.refresh() brings the new list.
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function toggleActive(u: UserRow) {
    setBusyId(u.id);
    setNotice(null);
    try {
      await saveUser(u, { name: u.name, email: u.email, role: u.role, department: u.department, isActive: !u.isActive });
      setNotice({ tone: "success", text: `${u.name} has been ${u.isActive ? "deactivated" : "activated"}.` });
      router.refresh();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "Could not update the user." });
    } finally {
      setBusyId(null);
    }
  }

  // The whole user list is already loaded, so filtering it in the browser is enough.
  const q = query.trim().toLowerCase();
  const shown = users
    .filter((u) => !removedIds.includes(u.id))
    .filter(
      (u) =>
        !q ||
        [u.name, u.email, departmentLabel(u.role === "ADMIN" ? null : u.department)].some((v) => v.toLowerCase().includes(q)),
    );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">User Management</h1>
          <p className="text-sm text-neutral-500">Create staff and admin accounts, edit details, reset passwords.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setEditing("new");
          }}
          className={btnPrimary}
        >
          + Create User
        </button>
      </div>

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

      <div className="max-w-sm">
        <label htmlFor="user-search" className="sr-only">
          Search users
        </label>
        <input
          id="user-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email or department"
          className={fieldInput}
        />
      </div>

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white px-6 py-14 text-center text-sm text-neutral-500">
          {users.length === 0 ? "No users yet." : "No users match your search."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Department</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Created</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {shown.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <tr key={u.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-medium text-neutral-900">
                      {u.name}
                      {isSelf && <span className="ml-1.5 text-xs font-normal text-neutral-400">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{u.email}</td>
                    <td className="px-4 py-3">
                      <Badge tone={u.role === "ADMIN" ? "dark" : "neutral"}>{u.role}</Badge>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{departmentLabel(u.role === "ADMIN" ? null : u.department)}</td>
                    <td className="px-4 py-3">
                      {u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-500">{formatDateTime(u.createdAt, timeZone)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setNotice(null);
                            setEditing(u);
                          }}
                          className={`${btnSecondary} px-3 py-1.5 text-xs`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleActive(u)}
                          disabled={isSelf || busyId === u.id}
                          title={isSelf ? "You cannot deactivate your own account" : undefined}
                          className={`${btnSecondary} w-[5.75rem] px-3 py-1.5 text-xs`}
                        >
                          {busyId === u.id ? "Saving…" : u.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNotice(null);
                            setDeleting(u);
                          }}
                          disabled={isSelf}
                          title={isSelf ? "You cannot delete your own account" : undefined}
                          className={`${btnDangerSubtle} px-3 py-1.5 text-xs`}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} labelledBy="user-dialog-title">
        {editing && (
          <UserForm
            key={editing === "new" ? "new" : editing.id}
            user={editing === "new" ? null : editing}
            isSelf={editing !== "new" && editing.id === currentUserId}
            onCancel={() => setEditing(null)}
            onSaved={(message) => {
              setEditing(null);
              setNotice({ tone: "success", text: message });
              router.refresh();
            }}
          />
        )}
      </Modal>

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} labelledBy="delete-dialog-title">
        {deleting && (
          <DeleteUserDialog
            key={deleting.id}
            user={deleting}
            onCancel={() => setDeleting(null)}
            onDeleted={(message) => {
              setRemovedIds((ids) => [...ids, deleting.id]);
              setDeleting(null);
              setNotice({ tone: "success", text: message });
              router.refresh();
            }}
          />
        )}
      </Modal>
    </>
  );
}

/** Native <dialog> kept in sync with React state (focus trap, Esc and backdrop come for free). */
function Modal({
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

function DeleteUserDialog({
  user,
  onCancel,
  onDeleted,
}: {
  user: UserRow;
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
      // The server re-checks the confirmation, permissions, self-delete and last-admin rules.
      const res = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "The user could not be deleted. Please try again.");
      onDeleted(body.message);
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Network error. Please try again.");
      setPending(false);
    }
  }

  const details: [string, string][] = [
    ["Name", user.name],
    ["Email", user.email],
    ["Role", user.role],
    ["Department", departmentLabel(user.role === "ADMIN" ? null : user.department)],
  ];

  return (
    <form onSubmit={onSubmit}>
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 id="delete-dialog-title" className="text-base font-semibold text-red-700">
          Delete User Permanently?
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
          <p className="mt-1">
            Deleting this user will permanently delete their account and all daily reports associated with this user.
          </p>
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
        <button type="button" onClick={onCancel} className={btnSecondary}>
          Cancel
        </button>
        <button type="submit" disabled={!confirmed || pending} className={btnDanger}>
          {pending ? "Deleting…" : "Delete Permanently"}
        </button>
      </div>
    </form>
  );
}

type UserFormValues = {
  name: string;
  email: string;
  password: string;
  role: "STAFF" | "ADMIN";
  department: DepartmentValue | "";
  isActive: boolean;
};

function UserForm({
  user,
  isSelf,
  onCancel,
  onSaved,
}: {
  user: UserRow | null;
  isSelf: boolean;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    clearErrors,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      password: "",
      role: user?.role ?? "STAFF",
      department: user?.role === "ADMIN" ? "" : (user?.department ?? ""),
      isActive: user?.isActive ?? true,
    },
  });
  // Departments exist only for STAFF: the field is hidden (and cleared) for ADMIN.
  const isStaff = useWatch({ control, name: "role" }) === "STAFF";

  const onSubmit = handleSubmit(async (formValues) => {
    setServerError(null);
    // Disabled inputs submit undefined; your own role/status can't change anyway (server enforces it too).
    const values = isSelf && user ? { ...formValues, role: user.role, isActive: true } : formValues;
    // Same Zod schema the API uses — the server re-validates everything.
    const parsed = (user ? updateUserSchema : createUserSchema).safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        setError(issue.path[0] as keyof UserFormValues, { message: issue.message });
      }
      return;
    }
    try {
      // Send the parsed values: an ADMIN goes out with department = null.
      onSaved(await saveUser(user, parsed.data));
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Could not save the user.");
    }
  });

  const err = (name: keyof UserFormValues) =>
    errors[name] && <p className="mt-1 text-xs text-red-700">{errors[name]?.message}</p>;

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="border-b border-neutral-200 px-5 py-4">
        <h2 id="user-dialog-title" className="text-base font-semibold text-neutral-900">
          {user ? `Edit ${user.name}` : "Create User"}
        </h2>
      </div>
      <div className="space-y-4 px-5 py-4">
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <div>
          <label htmlFor="u-name" className={fieldLabel}>
            Name
          </label>
          <input id="u-name" {...register("name")} autoFocus maxLength={100} className={fieldInput} />
          {err("name")}
        </div>
        <div>
          <label htmlFor="u-email" className={fieldLabel}>
            Email
          </label>
          <input
            id="u-email"
            type="email"
            {...register("email")}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            placeholder="name@company.com"
            className={fieldInput}
          />
          {err("email")}
        </div>
        <div>
          <label htmlFor="u-password" className={fieldLabel}>
            {user ? "Reset password" : "Password"}
          </label>
          <input
            id="u-password"
            type="password"
            {...register("password")}
            autoComplete="new-password"
            maxLength={128}
            placeholder={user ? "Leave blank to keep the current password" : "At least 8 characters"}
            className={fieldInput}
          />
          {err("password")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="u-role" className={fieldLabel}>
              Role
            </label>
            <select
              id="u-role"
              {...register("role", {
                onChange: (e) => {
                  if (e.target.value === "ADMIN") {
                    setValue("department", "");
                    clearErrors("department");
                  }
                },
              })}
              disabled={isSelf}
              className={fieldInput}
            >
              <option value="STAFF">STAFF</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            {err("role")}
          </div>
          {isStaff && (
            <div>
              <label htmlFor="u-dept" className={fieldLabel}>
                Department <span className="text-red-700">*</span>
              </label>
              <select
                id="u-dept"
                {...register("department")}
                aria-required="true"
                aria-invalid={!!errors.department}
                className={fieldInput}
              >
                <option value="">Select department</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {DEPARTMENT_LABELS[d]}
                  </option>
                ))}
              </select>
              {err("department")}
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <input type="checkbox" {...register("isActive")} disabled={isSelf} className="size-4 accent-neutral-900" />
          Active — can sign in
        </label>
        {isSelf && <p className="text-xs text-neutral-500">You cannot change your own role or deactivate your own account.</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
        <button type="button" onClick={onCancel} className={btnSecondary}>
          Cancel
        </button>
        <button type="submit" disabled={isSubmitting} className={btnPrimary}>
          {isSubmitting ? "Saving…" : user ? "Save changes" : "Create user"}
        </button>
      </div>
    </form>
  );
}
