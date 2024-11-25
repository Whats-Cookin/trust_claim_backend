BEGIN;

ALTER TABLE "Node" ALTER COLUMN descrip DROP NOT NULL;
ALTER TABLE "Edge" DROP CONSTRAINT "Edge_startNodeId_fkey";
ALTER TABLE "Edge" DROP CONSTRAINT "Edge_endNodeId_fkey";
ALTER TABLE "Edge" DROP CONSTRAINT "Edge_claimId_fkey";


\copy "Node" (id,"nodeUri",name,"entType",descrip) FROM '/fixture_data/nodes_clean.txt' WITH (FORMAT csv, DELIMITER '|');
\copy "Edge" (id,"startNodeId","endNodeId",label,"claimId") FROM '/fixture_data/edges_clean.txt' WITH (FORMAT csv, DELIMITER '|');
\copy "Claim" (id,subject,claim,object,statement) FROM '/fixture_data/claims_clean.txt' WITH (FORMAT csv, DELIMITER '|');


COMMIT;
