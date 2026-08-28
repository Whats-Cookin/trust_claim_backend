-- Alternate email addresses that belong to an existing User.
-- Stored lowercase; unique across the table so one address is one person.
CREATE TABLE "UserEmail" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserEmail_email_key" ON "UserEmail"("email");
CREATE INDEX "UserEmail_userId_idx" ON "UserEmail"("userId");

ALTER TABLE "UserEmail" ADD CONSTRAINT "UserEmail_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
