import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { getClaimNameFromNodeUri, makeClaimSubjectURL } from "../utils";
import { ExpandGraphType } from "../types/utils";

/**
 * Interface representing a node in the graph
 */
interface GraphNode {
  data: {
    id: string;
    label: string;
    entType: string;
    raw: Record<string, unknown>;
  };
}

/**
 * Interface representing an edge in the graph
 */
interface GraphEdge {
  data: {
    id: string;
    relation: string;
    source: string;
    target: string;
    raw: Record<string, unknown>;
  };
}

/**
 * Interface for the complete graph response
 */
export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Returns the base SQL query for retrieving claim data
 */
const getBaseQuery = (): string => {
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

/**
 * Retrieves graph data for a specific claim
 * 
 * @param claimId - The ID of the claim to retrieve graph data for
 * @param page - The page number for pagination
 * @param limit - The number of items per page
 * @param host - The host URL for creating subject URLs
 * @returns The graph data containing nodes and edges
 */
export const getGraphNode = async (
  claimId: string | number,
  page: number,
  limit: number,
  host: string,
): Promise<GraphResponse> => {
  const claimAsNodeUri = makeClaimSubjectURL(claimId.toString(), host);
  const numericClaimId = Number(claimId);

  const claimNode = await prisma.$queryRawUnsafe(`
    ${getBaseQuery()}
    WHERE c."id" = ${numericClaimId}
  `) as any[];

  if (claimNode.length === 0) {
    throw new Error("Claim not found");
  }

  // Handle credential claims
  if (claimNode[0].claim === "credential") {
    return handleCredentialClaim(claimNode[0]);
  } 
  // Handle regular claims
  else {
    return handleRegularClaim(claimNode[0]);
  }
};

/**
 * Handles the processing of credential claims
 * 
 * @param claimData - The claim data to process
 * @returns The graph response for the credential claim
 */
const handleCredentialClaim = async (claimData: any): Promise<GraphResponse> => {
  const issuerId = claimData.issuerid.split("/").pop();
  const subjectName = claimData.subject_name;
  
  // Create central subject node
  const subjectNode = createSubjectNode(subjectName);

  // Get all credentials with same subject_name
  const credentialsNodesRaw = await prisma.$queryRawUnsafe(`
    ${getBaseQuery()}
    WHERE cd."subject_name" = '${subjectName}'
    ORDER BY c.id ASC
  `) as any[];

  const credentialsNodes = credentialsNodesRaw.map(createCredentialNode);

  // Create edges from subject to all credentials
  const edges = credentialsNodes.map((credential: GraphNode) => 
    createEdge(
      subjectNode.data.id,
      credential.data.id,
      "has_credential",
      {
        endNodeId: credential.data.id,
        startNodeId: subjectNode.data.id,
        subject_name: subjectName,
        endClaimId: credential.data.raw.claimId,
      }
    )
  );

  return {
    nodes: [subjectNode, ...credentialsNodes],
    edges,
  };
};

/**
 * Handles the processing of regular claims
 * 
 * @param claimData - The claim data to process
 * @returns The graph response for the regular claim
 */
const handleRegularClaim = async (claimData: any): Promise<GraphResponse> => {
  const subjectName = claimData.subject_name;

  // Central subject node
  const subjectNode = createSubjectNode(subjectName);

  // Get all claims with the same subject_name
  const allClaims = await prisma.$queryRawUnsafe(`
    SELECT c.id, cd.name, cd.issuer_name, cd.subject_name
    FROM "Claim" AS c
    JOIN "ClaimData" AS cd ON c.id = cd."claimId"
    WHERE cd.subject_name = '${subjectName}'
  `) as any[];

  // Build nodes and edges
  const nodes: GraphNode[] = [subjectNode];
  const edges: GraphEdge[] = [];
  
  for (const claim of allClaims) {
    // Create claim node
    const claimNode = createClaimNode(claim);
    nodes.push(claimNode);
    
    // Edge: claim -> subject (about)
    edges.push(
      createEdge(
        claimNode.data.id,
        subjectNode.data.id,
        "about",
        { claim_name: claim.name, subject_name: subjectName }
      )
    );
    
    // Add issuer node if available
    if (claim.issuer_name) {
      addIssuerToGraph(claim, nodes, edges);
    }
  }
  
  return { nodes, edges };
};

/**
 * Creates a subject node
 * 
 * @param subjectName - The name of the subject
 * @returns A GraphNode representing the subject
 */
const createSubjectNode = (subjectName: string): GraphNode => {
  return {
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
};

/**
 * Creates a credential node
 * 
 * @param claim - The claim data for the credential
 * @returns A GraphNode representing the credential
 */
const createCredentialNode = (claim: Record<string, any>): GraphNode => {
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
};

/**
 * Creates a claim node
 * 
 * @param claim - The claim data
 * @returns A GraphNode representing the claim
 */
const createClaimNode = (claim: Record<string, any>): GraphNode => {
  return {
    data: {
      id: `claim_${claim.id}`,
      label: claim.name,
      entType: "CLAIM",
      raw: { 
        claimId: claim.id, 
        claim: claim.name, 
        subject_name: claim.subject_name,
        page: 0 
      },
    },
  };
};

/**
 * Adds an issuer to the graph
 * 
 * @param claim - The claim data associated with the issuer
 * @param nodes - The array of nodes to add to
 * @param edges - The array of edges to add to
 */
const addIssuerToGraph = (claim: Record<string, any>, nodes: GraphNode[], edges: GraphEdge[]): void => {
  const issuerNode = {
    data: {
      id: `issuer_${claim.issuer_name}`,
      label: claim.issuer_name,
      entType: "ISSUER",
      raw: { 
        issuer_name: claim.issuer_name, 
        subject_name: claim.subject_name, 
        page: 0 
      },
    },
  };
  
  // Only add if not already present
  if (!nodes.find(n => n.data.id === issuerNode.data.id)) {
    nodes.push(issuerNode);
  }
  
  // Edge: issuer -> claim (issued)
  edges.push(
    createEdge(
      issuerNode.data.id,
      `claim_${claim.id}`,
      "issued",
      { issuer_name: claim.issuer_name, claim_name: claim.name }
    )
  );
};

/**
 * Creates an edge between two nodes
 * 
 * @param source - The source node ID
 * @param target - The target node ID
 * @param relation - The relationship type
 * @param rawData - Additional data for the edge
 * @returns A GraphEdge connecting the nodes
 */
const createEdge = (
  source: string, 
  target: string, 
  relation: string, 
  rawData: Record<string, unknown>
): GraphEdge => {
  return {
    data: {
      id: `edge_${source}_${target}`,
      relation,
      source,
      target,
      raw: rawData,
    },
  };
};

/**
 * Expands the graph based on various criteria
 * 
 * @param claimId - The ID of the claim to expand
 * @param type - The type of expansion to perform
 * @param page - The page number for pagination
 * @param limit - The number of items per page
 * @param host - The host URL for creating subject URLs
 * @returns The expanded graph data
 */
export const expandGraph = async (
  claimId: string,
  type: ExpandGraphType,
  page: number,
  limit: number,
  host: string,
): Promise<GraphResponse> => {
  if (type === "validated" || type === "credential" || type === "claim") {
    return await getMoreValidations(Number(claimId), limit, page, host);
  }
  
  if (type === "author") {
    return await getMoreAuthorCredentials(Number(claimId), limit, page);
  }
  
  throw new Error("Invalid expansion type");
};

/**
 * Gets more author credentials for expanding the graph
 * 
 * @param claimId - The ID of the claim to get credentials for
 * @param limit - The number of items per page
 * @param page - The page number for pagination
 * @returns The graph data containing author credential nodes and edges
 */
const getMoreAuthorCredentials = async (
  claimId: number, 
  limit: number, 
  page: number
): Promise<GraphResponse> => {
  const claimNode = await prisma.$queryRawUnsafe(`
    ${getBaseQuery()}
    WHERE c."id" = ${claimId}
  `) as any[];

  if (claimNode.length === 0) {
    throw new Error("Claim not found");
  }

  const subjectName = claimNode[0].subject_name;

  // Get all credentials with same subject_name
  const credentialResults = await prisma.$queryRawUnsafe(`
    ${getBaseQuery()}
    WHERE cd."subject_name" = '${subjectName}' AND c."id" != ${claimId}
    ORDER BY c.id ASC
    LIMIT ${limit}
    OFFSET ${(page - 1) * limit}
  `) as any[];

  const credentials = credentialResults.map(createCredentialNode);
  
  // Create edges connecting to the subject
  const subjectNode = createSubjectNode(subjectName);
  const edges = credentials.map((credential: GraphNode) => 
    createEdge(
      subjectNode.data.id,
      credential.data.id,
      "has_credential",
      {
        subject_name: subjectName,
        credential_id: credential.data.raw.claimId,
      }
    )
  );

  return { nodes: credentials, edges };
};

const getMoreValidations = async (
  claimId: number,
  limit: number,
  page: number,
  host: string,
): Promise<GraphResponse> => {
  const claimNode = await prisma.$queryRawUnsafe(`
    ${getBaseQuery()}
    WHERE c."id" = ${Number(claimId)}
  `) as any[];

  if (claimNode.length === 0) throw new Error("Claim not found");

  const subjectName = claimNode[0].subject_name;

  // Get all claims with same subject_name
  let allClaims = await prisma.$queryRawUnsafe(`
    ${getBaseQuery()}
    WHERE cd."subject_name" = '${subjectName}' AND c."id" != ${Number(claimId)}
    ORDER BY c.id DESC
    LIMIT ${limit}
    OFFSET ${(page - 1) * limit}
  `) as any[];

  allClaims = allClaims.map((claim: Record<string, any>): GraphNode => {
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

  const edges = allClaims.map((claim: GraphNode): GraphEdge => {
    return {
      data: {
        id: `${subjectNode.data.id}-${claim.data.id}`,
        relation: claim.data.raw.claim as string,
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
