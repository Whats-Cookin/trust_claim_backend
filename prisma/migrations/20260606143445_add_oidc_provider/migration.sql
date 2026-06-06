-- OIDC provider tables (LinkedTrust-as-trust-provider).
-- Surgical migration: creates only the two new tables. Authored by hand rather
-- than `prisma migrate dev` because the dev DB has pre-existing drift (Django
-- admin tables, enum/index differences) that the normal flow would try to
-- reconcile destructively. Touches nothing that already exists.

-- CreateTable
CREATE TABLE "oidc_clients" (
    "id" SERIAL NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT NOT NULL,
    "name" TEXT,
    "redirect_uris" TEXT[],
    "allowed_scopes" TEXT[] DEFAULT ARRAY['openid', 'profile', 'email', 'trust']::TEXT[],
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oidc_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oidc_auth_codes" (
    "code" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "nonce" TEXT,
    "code_challenge" TEXT,
    "code_challenge_method" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oidc_auth_codes_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "oidc_clients_client_id_key" ON "oidc_clients"("client_id");

-- CreateIndex
CREATE INDEX "oidc_auth_codes_client_id_idx" ON "oidc_auth_codes"("client_id");

-- CreateIndex
CREATE INDEX "oidc_auth_codes_expires_at_idx" ON "oidc_auth_codes"("expires_at");
