import { Prisma } from "@prisma/client";
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

// Claim Dao is a Class to hold all the Prisma queries related to the Claim model
export class ClaimDao {
  createClaim = async (userId: any, rawClaim: any) => {
    const { name, images, ...rest } = rawClaim;
    const createdClaim = await prisma.claim.create({
      data: {
        issuerId: `${process.env.BASE_URL}/users/${userId}`,
        issuerIdType: "URL",
        ...rest,
      },
    });

    return createdClaim;
  };

  createImages = async (claimId: number, userId: any, images: any[]) => {
    let claimImages: any[] = [];

    if (images && images.length > 0) {
      claimImages = await Promise.all(
        images.map(async (img: any) => {
          if (img.effectiveDate) {
            img.effectiveDate = new Date(img.effectiveDate);
          }

          const image = await prisma.image.create({
            data: {
              claimId: claimId,
              owner: `${process.env.BASE_URL}/users/${userId}`,
              ...img,
            },
          });
          return image;
        })
      );
    }

    return claimImages;
  };

  createClaimData = async (id: number, name: string) => {
    return await prisma.claimData.create({
      data: {
        claimId: id,
        name: name,
      },
    });
  };

  getClaimById = async (id: number) => {
    const claim = await prisma.claim.findUnique({
      where: {
        id: id,
      },
    });

    const claimData = await this.getClaimData(id);

    const claimImages = await this.getClaimImages(id);

    return { claim, claimData, claimImages };
  };

  getClaimData = async (claimId: number) => {
    return await prisma.claimData.findUnique({
      where: {
        claimId: claimId,
      },
    });
  };

  getClaimImages = async (claimId: number) => {
    return await prisma.image.findMany({
      where: {
        claimId,
      },
    });
  };

  searchClaims = async (search: string, page: number, limit: number) => {
    const query: Prisma.ClaimWhereInput = {
      OR: [
        { subject: { contains: search, mode: "insensitive" } },
        { object: { contains: search, mode: "insensitive" } },
        { claim: { contains: search, mode: "insensitive" } },
        { statement: { contains: search, mode: "insensitive" } },
      ],
    };

    const claims = await prisma.claim.findMany({
      where: query,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit) ? Number(limit) : undefined,
    });

    const claimData = [];

    for (const claim of claims) {
      const data = await this.getClaimData(claim.id);
      const images = await this.getClaimImages(claim.id);
      const relatedNodes = await this.getRelatedNodes(claim.id);
      claimData.push({ data, claim, images, relatedNodes });
    }

    const count = await prisma.claim.count({ where: query });

    return { claimData, count };
  };

  getRelatedNodes = async (claimId: number) => {
    const edges = await prisma.edge.findMany({
      where: { claimId },
      include: {
        startNode: true,
        endNode: true,
      },
    });

    const nodeIds = new Set(
      edges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])
    );

    return prisma.node.findMany({
      where: {
        id: {
          in: Array.from(nodeIds).filter((id) => id !== null) as number[],
        },
      },
    });
  };

  getAllClaims = async (page: number, limit: number) => {
    // Fetch claims with pagination
    const claims = await prisma.claim.findMany({
      skip: (page - 1) * limit,
      take: limit > 0 ? limit : undefined,
    });
    const claimData = [];

    for (const claim of claims) {
      // Fetch claim data and images concurrently
      const [data, images] = await Promise.all([
        this.getClaimData(claim.id),
        this.getClaimImages(claim.id),
      ]);
      claimData.push({ data, claim, images });
    }

    const count = await prisma.claim.count({});

    return { claimData, count };
  };
}

interface FeedEntry {
  name: string;
  thumbnail: string | null;
  link: string;
  description: string | null;
  claim_id: number;
  statement: string | null;
  stars: number | null;
  score: number | null;
  amt: number | null;
  effective_date: Date | null;
  how_known: string | null;
  aspect: string | null;
  confidence: number | null;
  claim: string;
  basis: string | null;
  source_name: string | null;
  source_thumbnail: string | null;
  source_link: string | null;
  source_description: string | null;
  claim_name: string | null;
  image_url: string | null;
  image_digest: string | null;
  image_metadata: any | null;
}

// Node Dao is a Class to hold all the Prisma queries related to the Node model
export class NodeDao {
  getNodes = async (page: number, limit: number) => {
    return await prisma.node.findMany({
      skip: (Number(page) - 1) * Number(limit),
      take: 10,
      orderBy: {
        id: "desc",
      },
      include: {
        edgesFrom: {
          skip: (Number(page) - 1) * Number(limit),
          take: Number(limit) ? Number(limit) : undefined,
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
          skip: (Number(page) - 1) * Number(limit),
          take: Number(limit) ? Number(limit) : undefined,
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

  getFeedEntries = async (offset: number, limit: number, search: string) => {
    try {
      const baseWhereClause = `WHERE NOT (n1."entType" = 'CLAIM' AND e.label = 'source')`;

      const searchWhereClause = search
        ? `
        AND (
          c.statement ILIKE ${Prisma.sql`%${search}%`} OR
          c."sourceURI" ILIKE ${Prisma.sql`%${search}%`} OR
          c."subject" ILIKE ${Prisma.sql`%${search}%`} OR
          n1.name ILIKE ${Prisma.sql`%${search}%`} OR
          n3.name ILIKE ${Prisma.sql`%${search}%`} OR
          n3."descrip" ILIKE ${Prisma.sql`%${search}%`}
        )
      `
        : "";

      const whereClause = Prisma.sql`${Prisma.raw(
        baseWhereClause + searchWhereClause
      )}`;

      const rawQ = Prisma.sql`
        SELECT
          n1.name as name,
          n1.thumbnail as thumbnail,
          n1."nodeUri" as link,
          n1."descrip" as description,
          c.id as claim_id,
          c.statement as statement,
          c.stars as stars,
          c.score as score,
          c.amt as amt,
          c."effectiveDate" as effective_date,
          c."howKnown" as how_known,
          c.aspect as aspect,
          c.confidence as confidence,
          e.label as claim,
          e2.label as basis,
          n3.name as source_name,
          n3.thumbnail as source_thumbnail,
          n3."nodeUri" as source_link,
          n3."descrip" as source_description
        FROM "Claim" c
        INNER JOIN "Edge" AS e ON c.id = e."claimId"
        INNER JOIN "Node" AS n1 ON e."startNodeId" = n1.id
        INNER JOIN "Node" AS n2 ON e."endNodeId" = n2.id
        LEFT JOIN "Edge" as e2 ON n2.id = e2."startNodeId"
        LEFT JOIN "Node" as n3 ON e2."endNodeId" = n3.id
        ${whereClause}
        ORDER BY c."effectiveDate" DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      console.log(
        "Feed entries raw query: " +
          rawQ.sql +
          "\n with values \n" +
          rawQ.values
      );
      const feedEntries = await prisma.$queryRaw<FeedEntry[]>`${rawQ}`;
      return feedEntries;
    } catch (error) {
      console.error("Error fetching feed entries:", error);
      throw new Error("Failed to fetch feed entries");
    }
  };

  getNodeById = async (nodeId: number) => {
    return await prisma.node.findUnique({
      where: {
        id: Number(nodeId),
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
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit) ? Number(limit) : undefined,
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
              issuerId: `${process.env.BASE_URL}/users/${userId}`,
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
  const claimDao = new ClaimDao();

  const claim_as_node_uri = makeClaimSubjectURL(claimId);
  let images;
  let claimData;
  let relatedNodes;
  const claimToGet = await prisma.claim.findUnique({
    where: {
      id: Number(claimId),
    },
  });

  if (claimToGet) {
    images = await claimDao.getClaimImages(claimToGet.id);
    claimData = await claimDao.getClaimData(claimToGet.id);
    relatedNodes = await claimDao.getRelatedNodes(claimToGet.id);
  }

  if (!claimToGet) throw new createError.NotFound("Claim does not exist");

  const baseQuery = `
        SELECT DISTINCT
          n2.name AS name,
          n2.thumbnail AS thumbnail,
          n2."nodeUri" AS link,
          n2."image" AS image,
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
        JOIN "Node" AS n2 ON e."endNodeId" = n2.id
    `;

  // First get direct attestations about the claim itself, if any
  // These are what we call validations
  const validations = await prisma.$queryRaw<ReportI[]>`
      ${Prisma.raw(baseQuery)}
      WHERE n1."nodeUri" = ${claim_as_node_uri} AND c."id" != ${Number(claimId)}
      ORDER BY c.id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

  // Now get any other claims about the same subject, if any
  // the subject of the claim is claim.subject, not the url of the claim itself
  const attestations = await prisma.$queryRaw<ReportI[]>`
      ${Prisma.raw(baseQuery)}
      WHERE c."subject" = ${claimToGet?.subject} AND c."id" != ${Number(
    claimId
  )}
      ORDER BY c.id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

  //
  // later we might want a second level call where we ALSO get other claims about the nodes who were the source or issuer of the attestations
  //

  const edge = await prisma.edge.findFirst({
    where: {
      claimId: Number(claimId),
    },
    include: {
      startNode: true,
      endNode: true,
    },
  });

  // the Node of the Claim is the one representing the claim, not the subject
  // we may later want to put an image of the subject instead, we'll decide in design
  const NodeOfClaim = await prisma.node.findFirst({
    where: {
      nodeUri: claim_as_node_uri,
    },
  });

  const claim = {
    claim: claimToGet,
    images: images,
    claimData: claimData,
    relatedNodes: relatedNodes,
  };

  return {
    edge,
    claim: {
      ...claim,
      image: NodeOfClaim?.image,
    },
    validations,
    attestations,
  };
};
