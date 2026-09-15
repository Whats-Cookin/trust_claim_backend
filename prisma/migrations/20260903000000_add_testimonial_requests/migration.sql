-- CreateTable
CREATE TABLE "testimonial_requests" (
    "id" SERIAL NOT NULL,
    "token_hash" TEXT NOT NULL,
    "subject_uri" TEXT NOT NULL,
    "subject_name" TEXT,
    "recipient_name" TEXT,
    "recipient_profile" TEXT,
    "aspect" TEXT,
    "work_summary" TEXT,
    "note" TEXT,
    "requester_name" TEXT,
    "created_by_id" INTEGER,
    "claim_id" INTEGER,
    "responded_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "testimonial_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "testimonial_requests_token_hash_key" ON "testimonial_requests"("token_hash");

-- CreateIndex
CREATE INDEX "testimonial_requests_created_by_id_idx" ON "testimonial_requests"("created_by_id");
