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
- Manager Note and Performance Index are admin-only (`PATCH /api/reports/:id`).
- Sessions are server-side (`Session` table). Logout ends the session; deactivation and password changes sign the
  account out everywhere else. The session cookie is `Secure` in production, so serve the app over HTTPS.
- Emails are unique and stored lower-case.

## Checks

```bash
npm run lint
npx prisma validate && npx prisma migrate status
npm run build
```
