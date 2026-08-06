-- CreateTable
CREATE TABLE "atproto_oauth_state" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atproto_oauth_state_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "atproto_oauth_session" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atproto_oauth_session_pkey" PRIMARY KEY ("key")
);
