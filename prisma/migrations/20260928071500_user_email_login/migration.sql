-- Replace username with email as the sign-in identity, preserving existing users.

-- 1. Add email, backfill from the old username: keep it if it already looks like an email,
--    otherwise assign a development address (e.g. admin -> admin@your-domain.local).
ALTER TABLE "User" ADD COLUMN "email" TEXT;

UPDATE "User"
SET "email" = CASE
  WHEN "username" LIKE '%_@_%._%' THEN lower("username")
  ELSE lower("username") || '@your-domain.local'
END;

ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;

-- 2. Emails are unique (fails loudly instead of silently merging accounts).
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- 3. Drop username.
DROP INDEX "User_username_key";
ALTER TABLE "User" DROP COLUMN "username";
