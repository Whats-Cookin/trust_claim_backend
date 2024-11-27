-- Nodes
WITH claim_edge AS (
    SELECT * FROM "Edge" WHERE "claimId" IN (118499, 118500, 118501, 33594)
),
first_nodes AS (
    SELECT DISTINCT n.id, n."nodeUri", n.name, n."entType", n.descrip
    FROM "Node" n
    JOIN "Edge" e ON n."id" IN (e."startNodeId", e."endNodeId")
    WHERE e."claimId" IN (118499, 118500, 118501, 33594)
),
first_edges AS (
    SELECT e.*
    FROM "Edge" e
    WHERE e."startNodeId" IN (SELECT "id" FROM first_nodes)
    OR e."endNodeId" IN (SELECT "id" FROM first_nodes)
),
second_nodes AS (
    SELECT DISTINCT n.id, n."nodeUri", n.name, n."entType", n.descrip
    FROM "Node" n
    JOIN first_edges e ON n."id" IN (e."startNodeId", e."endNodeId")
),
second_edges AS (
    SELECT e.*
    FROM "Edge" e
    WHERE e."startNodeId" IN (SELECT "id" FROM second_nodes)
    OR e."endNodeId" IN (SELECT "id" FROM second_nodes)
    LIMIT 50
),
all_nodes AS (
    SELECT * FROM first_nodes
    UNION
    SELECT * FROM second_nodes
)
SELECT * FROM all_nodes;

-- Edges
WITH claim_edge AS (
    SELECT * FROM "Edge" WHERE "claimId" IN (118499, 118500, 118501, 33594)
),
first_nodes AS (
    SELECT DISTINCT n.id, n."nodeUri", n.name, n."entType", n.descrip
    FROM "Node" n
    JOIN "Edge" e ON n."id" IN (e."startNodeId", e."endNodeId")
    WHERE e."claimId" IN (118499, 118500, 118501, 33594)
),
first_edges AS (
    SELECT e.*
    FROM "Edge" e
    WHERE e."startNodeId" IN (SELECT "id" FROM first_nodes)
    OR e."endNodeId" IN (SELECT "id" FROM first_nodes)
),
second_nodes AS (
    SELECT DISTINCT n.id, n."nodeUri", n.name, n."entType", n.descrip
    FROM "Node" n
    JOIN first_edges e ON n."id" IN (e."startNodeId", e."endNodeId")
),
second_edges AS (
    SELECT e.*
    FROM "Edge" e
    WHERE e."startNodeId" IN (SELECT "id" FROM second_nodes)
    OR e."endNodeId" IN (SELECT "id" FROM second_nodes)
    LIMIT 50
),
all_edges AS (
    SELECT * FROM first_edges
    UNION
    SELECT * FROM second_edges
)
SELECT id, "startNodeId", "endNodeId", label, "claimId" FROM all_edges;

-- Claims
WITH claim_edge AS (
    SELECT * FROM "Edge" WHERE "claimId" IN (118499, 118500, 118501, 33594)
),
first_nodes AS (
    SELECT DISTINCT n.id, n."nodeUri", n.name, n."entType", n.descrip
    FROM "Node" n
    JOIN "Edge" e ON n."id" IN (e."startNodeId", e."endNodeId")
    WHERE e."claimId" IN (118499, 118500, 118501, 33594)
),
first_edges AS (
    SELECT e.*
    FROM "Edge" e
    WHERE e."startNodeId" IN (SELECT "id" FROM first_nodes)
    OR e."endNodeId" IN (SELECT "id" FROM first_nodes)
),
second_nodes AS (
    SELECT DISTINCT n.id, n."nodeUri", n.name, n."entType", n.descrip
    FROM "Node" n
    JOIN first_edges e ON n."id" IN (e."startNodeId", e."endNodeId")
),
second_edges AS (
    SELECT e.*
    FROM "Edge" e
    WHERE e."startNodeId" IN (SELECT "id" FROM second_nodes)
    OR e."endNodeId" IN (SELECT "id" FROM second_nodes)
    LIMIT 50
),
all_edges AS (
    SELECT * FROM first_edges
    UNION
    SELECT * FROM second_edges
)
SELECT id, subject, claim, object, statement FROM "Claim" c
WHERE c."id" IN (SELECT "claimId" FROM all_edges);
