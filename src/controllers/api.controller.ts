import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma';
import { Prisma } from 'prisma/prisma-client';
import {
  passToExpressErrorHandler,
  turnFalsyPropsToUndefined,
  poormansNormalizer,
  makeClaimSubjectURL,
} from '../utils';
import createError from 'http-errors';

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
        issuerIdType: 'URL',
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

export const claimGetById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { claimId } = req.params;
    const id = Number(claimId);

    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid claim ID' });
    }

    const claim = await prisma.claim.findUnique({
      where: {
        id: id,
      },
    });

    if (!claim) {
      throw new createError.NotFound('Not Found');
    }

    res.status(201).json(claim);
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

export const claimSearch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { search, page = 0, limit = 0 } = req.query;

    // this may also need decodeURIComponent, we should encapsulate this check 
    
    let claims = [];
    let count = 0;

    if (search) {
      const query: Prisma.ClaimWhereInput = {
        OR: [
          { subject: { contains: search as string, mode: 'insensitive' } },
          { object: { contains: search as string, mode: 'insensitive' } },
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
    const { page = 0, limit = 0 } = req.query;

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
        id: 'desc',
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
    // const { search } = req.query; // unused for now, TODO here search
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
      ORDER BY c."effectiveDate" DESC
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
// Function to get a node by its ID
export const getNodeById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { nodeId } = req.params;

    const node = await prisma.node.findUnique({
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

    if (!node) {
      throw new createError.NotFound('Node does not exist');
    }

    res.status(201).json(node);
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

// Function to search for nodes
export const searchNodes = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {

    /* TODO TODO TODO : why are we using a search when we hav ethe claim id ?????????? */
    /* this function can exist but it should not be called when we already know the claim id */
    /* it is currently being called from front end to see graph view of a known claim */
    /* front end shoudl change to pull by id, we need a new route to retrieve by id  or specific subject */
    
    const { search, page = 0, limit = 0 } = req.query;

    let clean_search = ''
    if (typeof search === 'string') {
      // for some reason they are getting double-encoded 
      clean_search = decodeURIComponent(search);
    } 

    let nodes = [];
    let count = 0;
    let query: Prisma.NodeWhereInput = {};

    if (clean_search) {
      query = {
        OR: [
          { name: { contains: clean_search, mode: 'insensitive' } },
          { descrip: { contains: clean_search, mode: 'insensitive' } },
          { nodeUri: { contains: clean_search, mode: 'insensitive' } },
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
              issuerIdType: 'URL',
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
  image: string;
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

    const claim_as_node_uri = makeClaimSubjectURL(claimId);

    const claim = await prisma.claim.findUnique({
      where: {
        id: Number(claimId),
      },
    });
    if (!claim) throw new createError.NotFound('Claim does not exist');

    // this is to retrieve claims about the original claim, and claims about the subject
    // we will need the node on either end, for matching and for data
    // the n1 node is the thing we are searching for claims about
    // the n2 node is the claims we found
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
      WHERE c."subject" = ${claim.subject} AND c."id" != ${Number(claimId)}
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
    });

    // the Node of the Claim is the one representing the claim, not the subject
    // we may later want to put an image of the subject instead, we'll decide in design
    const NodeOfClaim = await prisma.node.findFirst({
      where: {
        nodeUri: claim_as_node_uri,
      },
    });

    res.status(200).json({
      data: {
        edge,
        claim: {
          ...claim,
          image: NodeOfClaim?.image,
        },
        validations: validations,
        attestations,
      },
    });
    return;
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};
