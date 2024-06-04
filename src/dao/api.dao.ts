import { Prisma } from "prisma/prisma-client";
import { prisma } from "../db/prisma";
import createError from "http-errors";
import { makeClaimSubjectURL } from "../utils";

interface ReportI {
  name: string;
  thumbnail: string;
  link: string;
  claim_id: number;
  statement: string;
  stars: number;
  score: number;
  amt: number;
  effective_date: Date;
  how_known: string;
  aspect: string;
  confidence: number;
  claim: string;
  basis: string;
  source_name: string;
  source_thumbnail: string;
  source_link: string;
}

export class ClaimDao {
  createClaim = async (userId: any, rawClaim: any) => {
    return await prisma.claim.create({
      data: {
        issuerId: `http://trustclaims.whatscookin.us/users/${userId}`,
        issuerIdType: "URL",
        ...rawClaim,
      },
    });
  };

  getClaimById = async (id: number) => {
    return await prisma.claim.findUnique({
      where: {
        id: id,
      },
    });
  };

  searchClaims = async (search: string, page: number, limit: number) => {
    const query: Prisma.ClaimWhereInput = {
      OR: [
        { subject: { contains: search, mode: "insensitive" } },
        { object: { contains: search, mode: "insensitive" } },
      ],
    };

    const claims = await prisma.claim.findMany({
      where: query,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit) ? Number(limit) : undefined,
    });

    const count = await prisma.claim.count({ where: query });

    return { claims, count };
  };

  getAllClaims = async (page: number, limit: number) => {
    const claims = await prisma.claim.findMany({
      skip: (page - 1) * limit,
      take: limit > 0 ? limit : undefined,
    });

    const count = await prisma.claim.count({});

    return { claims, count };
  };
}

export class NodeDao {
  getNodes = async (page: number, limit: number) => {
    return await prisma.node.findMany({
      skip: (page - 1) * limit,
      take: 10,
      orderBy: {
        id: "desc",
      },
      include: {
        edgesFrom: {
          skip: (page - 1) * limit,
          take: limit ? limit : undefined,
          select: {
            id: true,
            claimId: true,
            startNodeId: true,
            endNodeId: true,
            label: true,
            thumbnail: true,
            claim: true,
            endNode: true,
            startNode: true,
          },
        },
        edgesTo: {
          skip: (page - 1) * limit,
          take: limit ? limit : undefined,
          select: {
            id: true,
            claimId: true,
            startNodeId: true,
            endNodeId: true,
            label: true,
            thumbnail: true,
            claim: true,
            endNode: true,
            startNode: true,
          },
        },
      },
    });
  };

  getFeedEntries = async (offset: number, limit: number) => {
    return await prisma.$queryRaw`
        SELECT n1.name as name, n1.thumbnail as thumbnail, n1."nodeUri" as link, c.id as claim_id, c.statement as statement, c.stars as stars, c.score as score, c.amt as amt, c."effectiveDate" as effective_date, c."howKnown" as how_known, c.aspect as aspect, c.confidence as confidence, e.label as claim, e2.label as basis, n3.name as source_name, n3.thumbnail as source_thumbnail, n3."nodeUri" as source_link
        FROM "Node" AS n1
        INNER JOIN "Edge" AS e ON n1.id = e."startNodeId"
        INNER JOIN "Node" AS n2 ON e."endNodeId" = n2.id
        INNER JOIN "Edge" as e2 on n2.id = e2."startNodeId"
        INNER JOIN "Node" as n3 on e2."endNodeId" = n3.id
        INNER JOIN "Claim" as c on e."claimId" = c.id
        WHERE NOT (n1."entType" = 'CLAIM' and e.label = 'source')
        ORDER BY c.id DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;
  };

  getNodeById = async (nodeId: number) => {
    return await prisma.node.findUnique({
      where: {
        id: nodeId,
      },
      include: {
        edgesFrom: {
          select: {
            id: true,
            claimId: true,
            startNodeId: true,
            endNodeId: true,
            label: true,
            thumbnail: true,
            claim: true,
            endNode: true,
            startNode: true,
          },
        },
        edgesTo: {
          select: {
            id: true,
            claimId: true,
            startNodeId: true,
            endNodeId: true,
            label: true,
            thumbnail: true,
            claim: true,
            endNode: true,
            startNode: true,
          },
        },
      },
    });
  };

  searchNodes = async (search: string, page: number, limit: number) => {
    const query: Prisma.NodeWhereInput = {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { descrip: { contains: search, mode: "insensitive" } },
        { nodeUri: { contains: search, mode: "insensitive" } },
      ],
    };

    const nodes = await prisma.node.findMany({
      skip: (page - 1) * limit,
      take: limit ? limit : undefined,
      where: query,
      include: {
        edgesFrom: {
          select: {
            id: true,
            claimId: true,
            startNodeId: true,
            endNodeId: true,
            label: true,
            thumbnail: true,
            claim: true,
            endNode: true,
            startNode: true,
          },
        },
        edgesTo: {
          select: {
            id: true,
            claimId: true,
            startNodeId: true,
            endNodeId: true,
            label: true,
            thumbnail: true,
            claim: true,
            endNode: true,
            startNode: true,
          },
        },
      },
    });

    const count = await prisma.node.count({ where: query });

    return { nodes, count };
  };

  getNodeForUser = async (userId: any, rawClaim: any) => {
    return await prisma.node.findMany({
      where: {
        edgesTo: {
          some: {
            claim: {
              issuerId: `http://trustclaims.whatscookin.us/users/${userId}`,
              issuerIdType: "URL",
              ...rawClaim,
            },
          },
        },
      },
      include: {
        edgesTo: {
          include: {
            endNode: true,
          },
        },
        edgesFrom: {
          include: {
            startNode: true,
          },
        },
      },
    });
  };
}

export const GetClaimReport = async (
  claimId: any,
  offset: number,
  limit: number
) => {
  const claim_as_node_uri = makeClaimSubjectURL(claimId);

  const claim = await prisma.claim.findUnique({
    where: {
      id: Number(claimId),
    },
  });

  if (!claim) throw new createError.NotFound("Claim does not exist");

  const baseQuery = `
    SELECT DISTINCT
      n1.name AS name,
      n1.thumbnail AS thumbnail,
      n1."nodeUri" AS link,
      c.id AS claim_id,
      c.statement AS statement,
      c.stars AS stars,
      c.score AS score,
      c.amt AS amt,
      c."effectiveDate" AS "effectiveDate",
      c."howKnown" AS "howKnown",
      c.aspect AS aspect,
      c.confidence AS confidence,
      e.label AS claim,
      c."sourceURI" AS source_name,
      c."sourceURI" AS source_link
    FROM "Claim" AS c
    JOIN "Edge" AS e ON c.id = e."claimId"
    JOIN "Node" AS n1 ON e."startNodeId" = n1.id
  `;

  const validations = await prisma.$queryRaw<ReportI>`
    ${Prisma.raw(baseQuery)}
    WHERE n1."nodeUri" = ${claim_as_node_uri} AND c."id" != ${claimId}
    ORDER BY c.id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const claimsOfSubj = await prisma.$queryRaw<ReportI>`
    ${Prisma.raw(baseQuery)}
    WHERE c."subject" = ${claim.subject.toLowerCase()} AND c."id" != ${claimId}  AND n1."nodeUri" = ${claim.subject.toLowerCase()}
    ORDER BY c.id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const edge = await prisma.edge.findFirst({
    where: {
      claimId: Number(claimId),
    },
  });

  return {
    edge,
    claim,
    validations,
    attestations: claimsOfSubj,
  };
};
