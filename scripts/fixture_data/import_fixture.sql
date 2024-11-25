BEGIN;

ALTER TABLE "Node" ALTER COLUMN descrip DROP NOT NULL;


\copy "Node" FROM '/fixture_data/nodes.txt' WITH (FORMAT csv, DELIMITER '|');
\copy "Edge" FROM '/fixture_data/edges.txt' WITH (FORMAT csv, DELIMITER '|');
\copy "Claim" FROM '/fixture_data/claims.txt' WITH (FORMAT csv, DELIMITER '|');


COMMIT;
