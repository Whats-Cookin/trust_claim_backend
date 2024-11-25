BEGIN;
\copy "Node" (id,nodeUri,name,entType,descrip,image,thumbnail) FROM 'nodes.txt' WITH (FORMAT csv, DELIMITER '|');
\copy "Edge" (id,startNodeId,endNodeId,label,thumbnail,claimId) FROM 'edges.txt' WITH (FORMAT csv, DELIMITER '|');
\copy "Claim" (id,subject,claim,object,statement,effectiveDate,sourceURI,howKnown,dateObserved,digestMultibase,author,curator,aspect,score,stars,amt,unit,howMeasured,intendedAudience,respondAt,confidence,issuerId,issuerIdType,claimAddress,proof,createdAt,lastUpdatedAt) FROM 'claims.txt' WITH (FORMAT csv, DELIMITER '|');
COMMIT;
