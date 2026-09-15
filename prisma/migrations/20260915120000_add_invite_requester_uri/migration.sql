ALTER TABLE "testimonial_requests" ADD COLUMN "requester_uri" TEXT;
CREATE INDEX "testimonial_requests_claim_id_idx" ON "testimonial_requests"("claim_id");
