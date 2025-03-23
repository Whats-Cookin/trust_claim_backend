import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { getClaimNameFromNodeUri, makeClaimSubjectURL } from "../utils";

interface GraphNode {
  data: {
    id: string;
    label: string;
    raw: any;
  };
}

interface GraphEdge {
  data: {
    id: string;
    relation: string;
    source: string;
    target: string;
    label: string;
    raw: any;
  };
}

interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const getGraphNode = async (
  claimId: string | number,
  page: number,
  limit: number,
  host: string,
): Promise<GraphResponse> => {
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
  const claim_as_node_uri = makeClaimSubjectURL(claimId.toString());

  console.log("Generated claim_as_node_uri:", claim_as_node_uri);

  console.log("makeClaimSubjectURL result:", makeClaimSubjectURL(claimId.toString()));

  let claimNode = await prisma.$queryRaw<any[]>`
    ${Prisma.raw(baseQuery)}
    WHERE c."id" = ${Number(claimId)}
    `;

  if (claimNode.length === 0) throw new Error("Claim not found");

  let validations = await prisma.$queryRaw<any[]>`
      ${Prisma.raw(baseQuery)}
      WHERE n1."nodeUri" = ${claim_as_node_uri} AND c."id" != ${Number(claimId)}
      ORDER BY c.id DESC
      LIMIT ${limit}
      OFFSET ${(page - 1) * limit}
    `;

  console.log("Validations Result:", validations);

  console.log("Claim Node Result:", claimNode);
  console.log("Validations Count:", validations.length);

  console.log("Claim as Node URI:", claim_as_node_uri);

  claimNode = claimNode.map((claim): GraphNode => {
    return {
      data: {
        id: `${claim.node_id}`,
        label: claim.label,
        raw: {
          claimId: `${claim.id}`,
          nodeId: `${claim.node_id}`,
          claim: claim.claim,
          page: 1,
        },
      },
    };
  });

  validations = validations.map((validation): GraphNode => {
    console.log("Raw Data:", validation);

    return {
      data: {
        id: `${validation.node_id}`,
        label: getClaimNameFromNodeUri(validation.sourceuri) || validation.label,
        raw: {
          claimId: `${validation.id}`,
          nodeId: `${validation.node_id}`,
          claim: validation.claim,
          page: 0,
        },
      },
    };
  });

  const edges = validations.map((validation): GraphEdge => {
    console.log("Validation Data for Edge:", validation);
    return {
      data: {
        id: `${validation.data.id}-${claimNode[0].data.id}`,
        relation: validation.data.raw.claim,
        target: claimNode[0].data.id,
        source: `${validation.data.id}`,
        label: "validation",
        raw: {
          endNodeId: `${validation.data.id}`,
          startNodeId: `${claimNode[0].data.id}`,
          startClaimId: `${claimNode[0].data.raw.claimId}`,
          endClaimId: `${validation.data.raw.claimId}`,
        },
      },
    };
  });

  return {
    nodes: [...claimNode, ...validations],
    edges,
  };
};

export const expandGraph = async (claimId: number, page: number, limit: number, host: string) => {
  const { nodes, edges } = await getGraphNode(claimId, page, limit, host);
  return {
    nodes: nodes.slice(1),
    edges,
  };
};
