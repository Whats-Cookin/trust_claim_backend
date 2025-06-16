-- CreateTable
CREATE TABLE "auth_apps" (
    "id" SERIAL NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "app_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_apps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_apps_client_id_key" ON "auth_apps"("client_id");

-- CreateIndex
CREATE INDEX "auth_apps_client_id_provider_idx" ON "auth_apps"("client_id", "provider");
