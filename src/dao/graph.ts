import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { makeClaimSubjectURL } from "../utils";

interface GraphNode {
  id: string;
  label: string;
  image: string;
  raw: any;
}

interface GraphEdge {
  id: string;
  relation: string;
  source: string;
  target: string;
  label: string;
  raw: any;
}

interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const getGraphNode = async (claimId: string | number) => {
  try {
    const baseQuery = `
    SELECT DISTINCT ON (c.id)
    c.id AS id,
    c.subject AS label,
    c.claim AS claim,
    c."sourceURI" AS sourceuri,
    
    n2.id AS node_id

    FROM "Claim" AS c
    JOIN "Edge" AS e ON c.id = e."claimId"
    JOIN "Node" AS n1 ON e."startNodeId" = n1.id
    JOIN "Node" AS n2 ON e."endNodeId" = n2.id
   `;

    const claim_as_node_uri = makeClaimSubjectURL(claimId.toString(), process.env.BASE_URL || "");

    let validations = await prisma.$queryRaw<any[]>`
          ${Prisma.raw(baseQuery)}
          WHERE n1."nodeUri" = ${claim_as_node_uri} AND c."id" != ${Number(claimId)}
          ORDER BY c.id DESC
        `;

    let claimNode = await prisma.$queryRaw<any[]>`
    ${Prisma.raw(baseQuery)}
    WHERE c."id" = ${Number(claimId)}
    `;

    claimNode = claimNode.map((claim) => {
      return {
        id: `${claim.node_id}`,
        label: claim.label,
        
        raw: {
          claimId: `${claim.id}`,
          nodeId: `${claim.node_id}`,
          claim: claim.claim,
        },
      };
    });

    validations = validations.map((validation) => {
      return {
        id: `${validation.node_id}`,
        label: validation.sourceuri || validation.label,
        raw: {
          claimId: `${validation.id}`,
          nodeId: `${validation.node_id}`,
          claim: validation.claim,
        },
      };
    });

    const edges = validations.map((validation) => {
      return {
        id: `${validation.id}-${claimNode[0].id}`,
        relation: validation.claim,
        target: claimNode[0].id,
        source: `${validation.id}`,
        label: "validation",
        raw: {
          endNodeId: `${validation.id}`,
          startNodeId: `${claimNode[0].id}`,
          startClaimId: `${claimNode[0].raw.claimId}`,
          endClaimId: `${validation.raw.claimId}`,
        },
      };
    });

    return {
      nodes: [...claimNode, ...validations].map((claim) => {
        return {
          data: {
            ...claim,
          },
        };
      }),
      edges: edges.map((edge) => {
        return {
          data: {
            ...edge,
          },
        };
      }),
    };
  } catch (err) {
    console.error(err);
  }
};
