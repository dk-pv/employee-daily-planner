-- Add the HR and Accounts departments. Additive only: existing users and reports are untouched.
-- (PostgreSQL 12+ allows ADD VALUE inside the migration transaction; the new values are not used here.)
ALTER TYPE "Department" ADD VALUE 'HR';
ALTER TYPE "Department" ADD VALUE 'ACCOUNTS';
