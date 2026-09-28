# Employee Daily Planner

Full-stack Next.js (App Router) app: staff fill in an A4-style daily planner; admins review reports and manage users.
Next.js route handlers are the backend; data lives in Neon PostgreSQL via Prisma. Everyone signs in with **email + password**.

## Setup

`.env.local` (not committed):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon connection string used by the app (pooled is fine) |
| `DIRECT_URL` | Neon **direct** (non-`-pooler`) connection string used by Prisma Migrate |
| `APP_TIMEZONE` | Business timezone for "today" and the 7-day edit window (default `Asia/Kolkata`) |
| `SEED_ADMIN_NAME` / `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | First admin account created by the seed |

```bash
npm install            # also runs prisma generate
npm run db:migrate     # prisma migrate dev (use db:deploy in production)
npm run db:seed        # creates the first admin from SEED_ADMIN_* (idempotent)
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
re-seeding creates a *new* admin with that email — rename the existing one in User Management instead.

## Rules worth knowing

- One report per staff member per date — enforced by `UNIQUE(userId, reportDate)`; saves are upserts.
- Staff can edit a report until `editableUntil = reportDate + 7 days` (checked server-side), and plan up to 7 days ahead.
- Drafts autosave; submitted reports change only via **Update Daily Report**.
- The planner is one printed A4 page, so rows are capped (enforced in the UI and the API, `ROW_LIMITS` in
  `lib/validations.ts`): Top Priorities 3, Communications 4 (Call / Email / Direct Meeting), Personal To Do 4,
  Daily Schedules 4, To Do List 8, Appointments 4; each row holds up to 100 characters, a manager note up to 600.
- Manager Note and Performance Index are admin-only (`PATCH /api/reports/:id`).
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

Shell variables take precedence over `.env.local` (nothing is written to disk), and the seed skips an email that
already exists.

## Checks

```bash
npm run lint
npx prisma validate && npx prisma migrate status
npm run build
```
