# Employee Daily Planner

Full-stack Next.js (App Router) app: staff fill in an A4-style daily planner; admins review reports and manage users.
Next.js route handlers are the backend; data lives in Neon PostgreSQL via Prisma. Everyone signs in with **email + password**.

## Setup

`.env.local` (not committed):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon connection string used by the app (pooled is fine) |
| `DIRECT_URL` | Neon **direct** (non-`-pooler`) connection string used by Prisma Migrate |
| `APP_TIMEZONE` | Business timezone for "today" and the 7-day draft window (default `Asia/Kolkata`) |
| `SEED_ADMIN_NAME` / `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | First admin account created by the seed |

```bash
npm install            # also runs prisma generate
npm run db:migrate     # prisma migrate dev (use db:deploy in production)
npm run db:seed        # first admin from SEED_ADMIN_* + the staff accounts in prisma/seed.ts (idempotent)
npm run dev            # http://localhost:3000
```

## First admin account

1. Add these lines to `.env.local` and choose your own strong password (8+ characters):

   ```bash
   SEED_ADMIN_NAME=Administrator
   SEED_ADMIN_EMAIL=admin@your-domain.local
   SEED_ADMIN_PASSWORD=<choose a strong password>
   ```

2. Run `npx prisma db seed`. It creates the admin only if no user with that email exists yet, so running it again never
   creates a duplicate and never changes an existing password.
3. Open `/login`.
4. Select the **Admin** tab.
5. Sign in with the email from `SEED_ADMIN_EMAIL` and the password you set in `SEED_ADMIN_PASSWORD`.

Then create staff accounts under **User Management**. After first sign-in you can change the admin's email or password
there (Edit); the seed values are only used when the account is first created. Changing `SEED_ADMIN_EMAIL` later and
re-seeding creates a *new* admin with that email — rename the existing one in User Management instead. Without
`SEED_ADMIN_EMAIL` the seed skips the admin step.

## Seeded staff accounts

`prisma/seed.ts` also lists the team's staff accounts (`STAFF`), each with password `<name in lower case>1234`
(stored hashed). Every seed run, matched by email (case-insensitive):

- a missing account is created (STAFF, active, with its department);
- an existing staff account gets its name, department and password reset to the listed values — so a password changed
  in User Management is reset too, and that account is signed out; activation status is left as it is;
- an email that belongs to an admin account is skipped and reported, never changed;
- users not in the list and all daily reports are never touched. A second run reports every account "already up to date".

## Rules worth knowing

- One report per staff member per date — enforced by `UNIQUE(userId, reportDate)`; saves are upserts.
- A **submitted** report can be edited for exactly 48 hours from its first submission (`submittedAt + 48 h`, server
  clock; editing never moves `submittedAt`), then it is read-only for staff. A **draft** can be edited and submitted
  until `editableUntil = reportDate + 7 days`; drafts from other days keep their own date and are linked from the
  planner. Both rules are checked server-side (`editLockReason` in `lib/reports.ts`). Staff can plan up to 7 days ahead.
- Drafts autosave; submitted reports change only via **Update Daily Report**.
- The planner is one printed A4 page, so rows are capped (enforced in the UI and the API, `ROW_LIMITS` in
  `lib/validations.ts`): Top Priorities 3, Communications 4 (Call / Email / Direct Meeting), Personal To Do 6,
  Daily Schedules 5, To Do List 18; each row has a text limit (`ROW_TEXT_MAX`), a manager note up to 600 characters.
- Manager Note and Performance Index are written only by admins (`PATCH /api/reports/:id`); staff see them read-only.
- Admins can permanently delete a single daily report (`DELETE /api/reports/:id`, confirmed by typing `DELETE`, which
  the server re-checks). The employee's account and other reports stay. Within the 7-day edit window the employee can
  start a new report for that date.
- Departments: Sales, Development, Marketing, HR, Accounts, Students — required for staff, always empty for admins. The list comes
  from the `Department` enum in `prisma/schema.prisma` (labels in `lib/utils.ts`); a new value needs a migration applied
  with `prisma migrate deploy` before anyone can select it.
- Sessions are server-side (`Session` table). Logout ends the session; deactivation and password changes sign the
  account out everywhere else. The session cookie is `Secure` in production, so serve the app over HTTPS.
- Emails are unique and stored lower-case.

## Deploying to Vercel

**Environment variables** (Project → Settings → Environment Variables):

| Variable | Environments | Value |
| --- | --- | --- |
| `DATABASE_URL` | Production, Preview | Neon **pooled** connection string (host contains `-pooler`) |
| `DIRECT_URL` | Production | Neon **direct** connection string (no `-pooler`) — used only by `prisma migrate deploy` during the build |
| `APP_TIMEZONE` | Production, Preview | `Asia/Kolkata` (Vercel servers run in UTC) |

Point Preview at a separate Neon branch, never at the production database. Do not set `SEED_ADMIN_*` (seeding is a
one-off from your machine) or `NODE_ENV` (Vercel manages it; forcing `production` at install time skips the
devDependencies the build needs, such as `prisma` and `typescript`).

**Build Command** (Project → Settings → Build & Development Settings → Override):

```bash
if [ "$VERCEL_ENV" = "production" ]; then npx prisma migrate deploy; fi && npm run build
```

Production builds apply pending migrations with `prisma migrate deploy` (never `db push`, never a reset) and fail the
deployment if a migration fails; Preview builds skip migrations. `npm run build` runs `prisma generate` then `next build`.

**First deploy:** after the first production build has created the tables, create the first admin once from your
machine against the production database. In PowerShell (the last command clears the variables again, so later
commands in the same terminal can't hit production by accident):

```powershell
$env:DATABASE_URL="<production connection string>"; $env:SEED_ADMIN_EMAIL="<admin email>"; $env:SEED_ADMIN_PASSWORD="<strong password>"
npx prisma db seed
Remove-Item Env:DATABASE_URL, Env:SEED_ADMIN_EMAIL, Env:SEED_ADMIN_PASSWORD
```

Shell variables take precedence over `.env.local` (nothing is written to disk), and the seed skips an admin email that
already exists. **The same run also seeds the staff accounts** (see [Seeded staff accounts](#seeded-staff-accounts)):
it creates the missing ones and resets the name, department and password of existing ones.

## Checks

```bash
npm run lint
npx prisma validate && npx prisma migrate status
npm run build
```
