-- One account per email address, whatever its capitals. User_email_key only
-- blocks exact matches, so Name@x.com and name@x.com could be two people.
-- Applied to the claim DB 2026-10-20; IF NOT EXISTS keeps a re-run harmless.
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_key" ON "User" (lower(email));
