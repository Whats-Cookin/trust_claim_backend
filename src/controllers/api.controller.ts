import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { Prisma } from "prisma/prisma-client";
import {
  passToExpressErrorHandler,
  turnFalsyPropsToUndefined,
  poormansNormalizer,
} from "../utils";
import createError from "http-errors";

export const claimPost = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let claim;
  try {
    const userId = (req as ModifiedRequest).userId;
    let rawClaim: any = turnFalsyPropsToUndefined(req.body);
    rawClaim = poormansNormalizer(rawClaim);
    claim = await prisma.claim.create({
      data: {
        issuerId: `http://trustclaims.whatscookin.us/users/${userId}`,
        issuerIdType: "URL",
        ...rawClaim,
      },
    });
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }

  // if (
  //   process.env.COMPOSEDB_URL &&
  //   process.env.COMPOSEDB_USERNAME &&
  //   process.env.COMPOSEDB_PASSWORD &&
  //   claim
  // ) {
  //   try {
  //     const { id: claimId, ...rest } = claim;
  //     await axios.post(
  //       process.env.COMPOSEDB_URL,
  //       { claimId, ...rest },
  //       {
  //   timeout: 10000,
  //         auth: {
  //           username: process.env.COMPOSEDB_USERNAME,
  //           password: process.env.COMPOSEDB_PASSWORD,
  //         },
  //       }
  //     );
  //   } catch (err: any) {
  //     console.error(err);
  //   }
  // }

  res.status(201).json(claim);
};

export const claimGet = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { search, page = 0, limit = 0 } = req.query;
    const { claimId } = req.params;

    if (claimId) {
      const claim = await prisma.claim.findUnique({
        where: {
          id: Number(claimId),
        },
      });

      if (!claim) {
        throw new createError.NotFound("Not Found");
      }

      res.status(201).json(claim);
      return;
    }

    let claims = [];
    let count = 0;
    if (search) {
      const query: Prisma.ClaimWhereInput = {
        OR: [
          { subject: { contains: search as string, mode: "insensitive" } },
          { object: { contains: search as string, mode: "insensitive" } },
        ],
      };
      claims = await prisma.claim.findMany({
        where: query,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit) ? Number(limit) : undefined,
      });
      count = await prisma.claim.count({ where: query });
    } else {
      count = await prisma.claim.count({});
      claims = await prisma.claim.findMany({
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit) > 0 ? Number(limit) : undefined,
      });
    }

    res.status(201).json({ claims, count });
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

export const claimsGet = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { search, page = 0, limit = 0 } = req.query;

    // const claims = await prisma.claim.findMany({
    //   skip: (Number(page) - 1) * Number(limit),
    //   take: 10,
    //   orderBy: {
    //     createdAt: 'desc',
    //   }
    // })

    const nodes = await prisma.node.findMany({
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
    res.status(200).json(nodes);
    return;
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};
/*********************************************************************/

export const claimsFeed = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { search } = req.query; // unused for now, TODO here search
    let { page = 1, limit = 100 } = req.query; // defaults provided here

    // Convert them to numbers
    page = Number(page);
    limit = Number(limit);

    const offset = (page - 1) * limit;

    const feed_entries = await prisma.$queryRaw`
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

    res.status(200).json(feed_entries);
    return;
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

/*********************************************************************/
export const nodesGet = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { search, page = 0, limit = 0 } = req.query;
    const { nodeId } = req.params;

    if (nodeId) {
      const node = await prisma.node.findUnique({
        where: {
          id: Number(nodeId),
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

      if (!node) {
        throw new createError.NotFound("Node does not exist");
      }

      res.status(201).json(node);
      return;
    }

    let nodes = [];
    let count = 0;
    let query: Prisma.NodeWhereInput = {};
    if (search) {
      query = {
        OR: [
          { name: { contains: search as string, mode: "insensitive" } },
          { descrip: { contains: search as string, mode: "insensitive" } },
          { nodeUri: { contains: search as string, mode: "insensitive" } },
        ],
      };
    }
    nodes = await prisma.node.findMany({
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

    count = await prisma.node.count({ where: query });

    res.status(201).json({ nodes, count });
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

// this is fine, later we also want to find the nodes with their metamask DID - most of them will NOT be by their issuer id

// Most would be by their DID, most users will NOT identify by our user id, but by some external universal way

export const getNodeForLoggedInUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as ModifiedRequest).userId;
    const rawClaim: any = turnFalsyPropsToUndefined(req.body);

    // Find a single node connected to the user's claims
    const node = await prisma.node.findMany({
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

    res.status(200).json({ node });
  } catch (err) {
    console.error(err);
    passToExpressErrorHandler(err, next);
  }
};

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

export const claimReport = async (
  req: Request,
  res: Response,
  next: NextFunction
  ) => {
  try {
    const { claimId } = req.params;
    let { page = 1, limit = 100 } = req.query; // defaults provided here

    // Convert them to numbers
    page = Number(page);
    limit = Number(limit);

    const offset = (page - 1) * limit;

    const claim_as_node_uri = `https://linkedtrust.us/claims/${claimId}`;

    const claim = await prisma.$queryRaw<any>`
      SELECT *
      FROM "Claim" AS c
      WHERE c."id" = ${Number(claimId)}
    `;

    // First get direct attestations, if any
    const attestations = await prisma.$queryRaw<ReportI[]>`
      SELECT n1.name as name, n1.thumbnail as thumbnail, n1."nodeUri" as link, c.id as claim_id, c.statement as statement, c.stars as stars, c.score as score, c.amt as amt, c."effectiveDate" as effective_date, c."howKnown" as how_known, c.aspect as aspect, c.confidence as confidence, e.label as claim, e2.label as basis, n3.name as source_name, n3.thumbnail as source_thumbnail, n3."nodeUri" as source_link
      FROM "Node" AS n1
      INNER JOIN "Edge" AS e ON n1.id = e."startNodeId"
      INNER JOIN "Node" AS n2 ON e."endNodeId" = n2.id
      INNER JOIN "Edge" as e2 on n2.id = e2."startNodeId"
      INNER JOIN "Node" as n3 on e2."endNodeId" = n3.id
      INNER JOIN "Claim" as c on e."claimId" = c.id

      where n1."nodeUri" = ${claim_as_node_uri} AND c."id" != ${Number(claimId)}

      ORDER BY c.id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const subject = await prisma.$queryRaw<{subject: string}[]>`
      SELECT c."subject" as subject
      FROM "Claim" AS c
      WHERE c."id" = ${Number(claimId)} LIMIT 1
    `;

    const claimsOfSubj = await prisma.$queryRaw<ReportI>`
      SELECT DISTINCT
          n1.name AS name,
          n1.thumbnail AS thumbnail,
          n1."nodeUri" AS link,
          c.id AS claim_id,
          c.statement AS statement,
          c.stars AS stars,
          c.score AS score,
          c.amt AS amt,
          c."effectiveDate" AS effective_date,
          c."howKnown" AS how_known,
          c.aspect AS aspect,
          c.confidence AS confidence,
          e.label AS claim,
          e2.label AS basis,
          n3.name AS source_name,
          n3.thumbnail AS source_thumbnail,
          n3."nodeUri" AS source_link
      FROM
          "Claim" AS c
      INNER JOIN
          "Edge" AS e ON c.id = e."claimId"
      INNER JOIN
          "Node" AS n1 ON e."startNodeId" = n1.id
      INNER JOIN
          "Edge" AS e2 ON n1.id = e2."startNodeId"
      INNER JOIN
          "Node" AS n3 ON e2."endNodeId" = n3.id
      WHERE
          c."subject" =  ${subject[0].subject} AND c."id" != ${Number(claimId)}

      ORDER BY c.id DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    //
    // TODO ALSO get other claims about the same subject ie about the subject url of the original claim
    // then ALSO get other claims about the nodes who were the source or issuer of the attestations
    // those can be separate PRs lets start with this one working and the design for it
    //

    res.status(200).json({
      data: {
        claim: claim[0],
        attestations,
        claimsOfSubj,
      }
    });
    return;
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};
