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

  const claimNode = await prisma.$queryRaw<any[]>`
    ${Prisma.raw(getBaseQuery())}
    WHERE c."id" = ${Number(claimId)}
    `;

  if (claimNode.length === 0) throw new Error("Claim not found");

  if (claimNode[0].claim === "credential") {
    const issuerId = claimNode[0].issuerid.split("/").pop();
    const subjectName = claimNode[0].subject_name;
    
    // Create central subject node
    const subjectNode = {
      data: {
        id: `subject_${subjectName}`,
        label: subjectName,
        entType: "SUBJECT",
        raw: {
          subject_name: subjectName,
          page: 0,
        },
      },
    };

    // Get all credentials with same subject_name
    let credentialsNodes = await prisma.$queryRaw<any[]>`
      ${Prisma.raw(getBaseQuery())}
      WHERE cd."subject_name" = ${subjectName}
      ORDER BY c.id ASC
    `;

    credentialsNodes = credentialsNodes.map((claim): GraphNode => {
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

    // Create edges from subject to all credentials
    const edges = credentialsNodes.map((credential): GraphEdge => {
      return {
        data: {
          id: `${subjectNode.data.id}-${credential.data.id}`,
          relation: "has_credential",
          source: subjectNode.data.id,
          target: credential.data.id,
          raw: {
            endNodeId: `${credential.data.id}`,
            startNodeId: `${subjectNode.data.id}`,
            subject_name: subjectName,
            endClaimId: `${credential.data.raw.claimId}`,
          },
        },
      };
    });

    return {
      nodes: [subjectNode, ...credentialsNodes],
      edges,
    };
  } else {
    const subjectName = claimNode[0].subject_name;
    
    // Create central subject node
    const subjectNode = {
      data: {
        id: `subject_${subjectName}`,
        label: subjectName,
        entType: "SUBJECT",
        raw: {
          subject_name: subjectName,
          page: 0,
        },
      },
    };

    // Get all claims with same subject_name
    let allClaims = await prisma.$queryRaw<any[]>`
      ${Prisma.raw(getBaseQuery())}
      WHERE cd."subject_name" = ${subjectName}
      ORDER BY c.id DESC
    `;

    allClaims = allClaims.map((claim): GraphNode => {
      return {
        data: {
          id: `${claim.node_id}`,
          label: claim.label,
          entType: "CLAIM",
          raw: {
            claimId: `${claim.id}`,
            nodeId: `${claim.node_id}`,
            claim: claim.claim,
            page: 0,
          },
        },
      };
    });

    // Create edges from subject to all claims
    const edges = allClaims.map((claim): GraphEdge => {
      return {
        data: {
          id: `${subjectNode.data.id}-${claim.data.id}`,
          relation: claim.data.raw.claim,
          source: subjectNode.data.id,
          target: claim.data.id,
          raw: {
            endNodeId: `${claim.data.id}`,
            startNodeId: `${subjectNode.data.id}`,
            subject_name: subjectName,
            endClaimId: `${claim.data.raw.claimId}`,
          },
        },
      };
    });

    return {
      nodes: [subjectNode, ...allClaims],
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

  const subjectName = claimNode[0].subject_name;

  // Get all credentials with same subject_name
  let credentialsNodes = await prisma.$queryRaw<any[]>`
    ${Prisma.raw(getBaseQuery())}
    WHERE cd."subject_name" = ${subjectName} AND c."id" != ${Number(claimId)}
    ORDER BY c.id ASC
    LIMIT ${limit}
    OFFSET ${(page - 1) * limit}
  `;

  credentialsNodes = credentialsNodes.map((claim): GraphNode => {
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

  const subjectNode = {
    data: {
      id: `subject_${subjectName}`,
      label: subjectName,
      entType: "SUBJECT",
      raw: {
        subject_name: subjectName,
        page: 0,
      },
    },
  };

  const edges = credentialsNodes.map((credential): GraphEdge => {
    return {
      data: {
        id: `${subjectNode.data.id}-${credential.data.id}`,
        relation: "has_credential",
        source: subjectNode.data.id,
        target: credential.data.id,
        raw: {
          endNodeId: `${credential.data.id}`,
          startNodeId: `${subjectNode.data.id}`,
          subject_name: subjectName,
          endClaimId: `${credential.data.raw.claimId}`,
        },
      },
    };
  });

  return {
    nodes: [subjectNode, ...credentialsNodes],
    edges,
  };
};

const getMoreValidations = async (
  claimId: number,
  limit: number,
  page: number,
  host: string,
): Promise<GraphResponse> => {
  const claimNode = await prisma.$queryRaw<any[]>`
    ${Prisma.raw(getBaseQuery())}
    WHERE c."id" = ${Number(claimId)}
  `;

  if (claimNode.length === 0) throw new Error("Claim not found");

  const subjectName = claimNode[0].subject_name;

  // Get all claims with same subject_name
  let allClaims = await prisma.$queryRaw<any[]>`
    ${Prisma.raw(getBaseQuery())}
    WHERE cd."subject_name" = ${subjectName} AND c."id" != ${Number(claimId)}
    ORDER BY c.id DESC
    LIMIT ${limit}
    OFFSET ${(page - 1) * limit}
  `;

  allClaims = allClaims.map((claim): GraphNode => {
    return {
      data: {
        id: `${claim.node_id}`,
        label: claim.label,
        entType: "CLAIM",
        raw: {
          claimId: `${claim.id}`,
          nodeId: `${claim.node_id}`,
          claim: claim.claim,
          page: 0,
        },
      },
    };
  });

  const subjectNode = {
    data: {
      id: `subject_${subjectName}`,
      label: subjectName,
      entType: "SUBJECT",
      raw: {
        subject_name: subjectName,
        page: 0,
      },
    },
  };

  const edges = allClaims.map((claim): GraphEdge => {
    return {
      data: {
        id: `${subjectNode.data.id}-${claim.data.id}`,
        relation: claim.data.raw.claim,
        source: subjectNode.data.id,
        target: claim.data.id,
        raw: {
          endNodeId: `${claim.data.id}`,
          startNodeId: `${subjectNode.data.id}`,
          subject_name: subjectName,
          endClaimId: `${claim.data.raw.claimId}`,
        },
      },
    };
  });

  return {
    nodes: [subjectNode, ...allClaims],
    edges,
  };
};
