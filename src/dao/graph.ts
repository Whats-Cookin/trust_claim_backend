import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { getClaimNameFromNodeUri, makeClaimSubjectURL } from "../utils";
import { ExpandGraphType } from "../types/utils";

interface GraphNode {
  data: {
    id: string;
    label: string;
    entType: string;
    raw: any;
  };
}

interface GraphEdge {
  data: {
    id: string;
    relation: string;
    source: string;
    target: string;
    raw: any;
  };
}

interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

const getBaseQuery = () => {
  return `
    SELECT DISTINCT ON (c.id)
    c.id AS id,
    c.subject AS label,
    c.claim AS claim,
    c."sourceURI" AS sourceuri,
    cd.subject_name AS subject_name,
    cd.issuer_name AS issuer_name,
    c."issuerId" AS issuerId,
    n2.id AS node_id
    FROM "Claim" AS c
    JOIN "ClaimData" AS cd ON c.id = cd."claimId"
    JOIN "Edge" AS e ON c.id = e."claimId"
    JOIN "Node" AS n1 ON e."startNodeId" = n1.id
    JOIN "Node" AS n2 ON e."endNodeId" = n2.id
   `;
};
export const getGraphNode = async (
  claimId: string | number,
  page: number,
  limit: number,
  host: string,
): Promise<GraphResponse> => {
  const claim_as_node_uri = makeClaimSubjectURL(claimId.toString(), host);

  let claimNode = await prisma.$queryRaw<any[]>`
    ${Prisma.raw(getBaseQuery())}
    WHERE c."id" = ${Number(claimId)}
    `;

  if (claimNode.length === 0) throw new Error("Claim not found");

  if (claimNode[0].claim === "credential") {
    const issuerId = claimNode[0].issuerid.split("/").pop();
    const autherNode = {
      data: {
        id: `${issuerId}`,
        label: claimNode[0].subject_name || claimNode[0].label ,
        entType: "AUTHOR",
        raw: {
          claimId: `${claimNode[0].id}`,
          claim: "author",
          page: 0,
        },
      },
    };

    claimNode = claimNode.map((claim): GraphNode => {
      return {
        data: {
          id: `${claim.node_id}`,
          label: claim.label,
          entType: "CREDENTIAL",
          raw: {
            claimId: `${claim.id}`,
            nodeId: `${claim.node_id}`,
            claim: claim.claim,
            page: 0,
          },
        },
      };
    });

    const edges = claimNode.map((credential): GraphEdge => {
      return {
        data: {
          id: `${credential.data.id}-${autherNode.data.id}`,
          relation: "has_credential",
          source: `${autherNode.data.id}`,
          target: `${credential.data.id}`,
          raw: {
            endNodeId: `${credential.data.id}`,
            startNodeId: `${autherNode.data.id}`,
            startClaimId: `${autherNode.data.raw.claimId}`,
            endClaimId: `${credential.data.raw.claimId}`,
          },
        },
      };
    });

    return {
      nodes: [autherNode, ...claimNode],
      edges,
    };
  } else {
    let validations = await prisma.$queryRaw<any[]>`
      ${Prisma.raw(getBaseQuery())}
      WHERE n1."nodeUri" = ${claim_as_node_uri} AND c."id" != ${Number(claimId)}
      ORDER BY c.id DESC
      LIMIT ${limit}
      OFFSET ${(page - 1) * limit}
    `;

    claimNode = claimNode.map((claim): GraphNode => {
      return {
        data: {
          id: `${claim.node_id}`,
          label: claim.label,
          entType: "CLAIM",
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
      return {
        data: {
          id: `${validation.node_id}`,
          label: getClaimNameFromNodeUri(validation.sourceuri) || validation.label,
          entType: "VALIDATION",
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
      return {
        data: {
          id: `${validation.data.id}-${claimNode[0].data.id}`,
          relation: validation.data.raw.claim,
          target: claimNode[0].data.id,
          source: `${validation.data.id}`,
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
  }
};

export const expandGraph = async (
  claimId: string,
  type: ExpandGraphType,
  page: number,
  limit: number,
  host: string,
) => {
  if (type === "validated" || type === "credential" || type === "claim") {
    const { nodes, edges } = await getMoreValidations(Number(claimId), limit, page, host);
    return {
      nodes,
      edges,
    };
  }
  if (type === "author") {
    const { nodes, edges } = await getMoreAuthorCredentials(Number(claimId), limit, page);
    return {
      nodes,
      edges,
    };
  }
  throw new Error("Invalid type");
};

const getMoreAuthorCredentials = async (claimId: number, limit: number, page: number): Promise<GraphResponse> => {
  const claimNode = await prisma.$queryRaw<any[]>`
    ${Prisma.raw(getBaseQuery())}
    WHERE c."id" = ${Number(claimId)}
    `;

  if (claimNode.length === 0) throw new Error("Claim not found");

  const issuerId = claimNode[0].issuerid.split("/").pop();
  const author = claimNode[0].subject_name;

  let credentialsNodes = await prisma.$queryRaw<any[]>`
    ${Prisma.raw(getBaseQuery())}
    WHERE cd."subject_name" = ${author} AND c."id" != ${Number(claimId)}
    ORDER BY c.id ASC
    LIMIT ${limit}
    OFFSET ${(page - 1) * limit}
  `;

  credentialsNodes = credentialsNodes.map((claim): GraphNode => {
    return {
      data: {
        id: `${claim.node_id}`,
        label: claim.subject_name || claim.label,
        entType: "CREDENTIAL",
        raw: {
          claimId: `${claim.id}`,
          nodeId: `${claim.node_id}`,
          claim: claim.claim,
          page: 0,
        },
      },
    };
  });

  const edges = credentialsNodes.map((credential): GraphEdge => {
    return {
      data: {
        id: `${credential.data.id}-${issuerId}`,
        relation: "has_credential",
        source: `${issuerId}`,
        target: `${credential.data.id}`,
        raw: {
          endNodeId: `${credential.data.id}`,
          startNodeId: `${issuerId}`,
          startClaimId: `${claimNode[0].id}`,
          endClaimId: `${credential.data.raw.claimId}`,
        },
      },
    };
  });

  return {
    nodes: credentialsNodes,
    edges,
  };
};

const getMoreValidations = async (
  claimId: number,
  limit: number,
  page: number,
  host: string,
): Promise<GraphResponse> => {
  const claim_as_node_uri = makeClaimSubjectURL(claimId.toString(), host);

  const claimNode = await prisma.$queryRaw<any[]>`
    ${Prisma.raw(getBaseQuery())}
    WHERE c."id" = ${Number(claimId)}
  `;

  if (claimNode.length === 0) throw new Error("Claim not found");

  let validations = await prisma.$queryRaw<any[]>`
    ${Prisma.raw(getBaseQuery())}
    WHERE n1."nodeUri" = ${claim_as_node_uri} AND c."id" != ${Number(claimId)}
    ORDER BY c.id DESC
    LIMIT ${limit}
    OFFSET ${(page - 1) * limit}
  `;

  validations = validations.map((validation): GraphNode => {
    return {
      data: {
        id: `${validation.node_id}`,
        label: getClaimNameFromNodeUri(validation.sourceuri) || validation.label,
        entType: "VALIDATION",
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
    return {
      data: {
        id: `${validation.data.id}-${claimNode[0].node_id}`,
        relation: validation.data.raw.claim,
        target: claimNode[0].node_id,
        source: `${validation.data.id}`,
        raw: {
          endNodeId: `${validation.data.id}`,
          startNodeId: `${claimNode[0].node_id}`,
          startClaimId: `${claimNode[0].id}`,
          endClaimId: `${validation.data.raw.claimId}`,
        },
      },
    };
  });

  return {
    nodes: validations,
    edges,
  };
};
