/**
 * sign-linked-claim
 * 
 * Canonical serialization and signing for linked claims.
 * Reference implementation for the LinkedClaims specification.
 * 
 * @package sign-linked-claim
 * @version 0.1.0
 */

export interface LinkedClaim {
  // Core claim triple
  subject: string;
  claim: string;
  object?: string;
  
  // Optional fields that are part of the signed content
  statement?: string;
  effectiveDate?: string | Date;
  sourceURI?: string;
  howKnown?: string;
  confidence?: number; // The signer's confidence at time of signing (0-1)
  
  // Ratings/measurements (included in signature)
  aspect?: string;
  stars?: number;
  score?: number;
  amt?: number;
  unit?: string;
  
  // These are NOT part of the canonical claim:
  // - issuerId (derived from signature)
  // - proof (contains the signature)
}

export interface LinkedClaimProof {
  type: string;
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  proofValue?: string; // The actual signature
  
  // Additional context
  authenticationMethod?: string;
  ethereumAddress?: string;
}

/**
 * Creates a canonical JSON representation of a claim for signing.
 * This ensures consistent serialization across implementations.
 */
export function canonicalizeClaim(claim: LinkedClaim): string {
  // Create canonical object with only defined values
  const canonical: any = {};
  
  // Always include core triple
  canonical.subject = claim.subject;
  canonical.claim = claim.claim;
  if (claim.object !== undefined) canonical.object = claim.object;
  
  // Optional content fields (alphabetical order for consistency)
  if (claim.amt !== undefined) canonical.amt = claim.amt;
  if (claim.aspect !== undefined) canonical.aspect = claim.aspect;
  if (claim.confidence !== undefined) canonical.confidence = claim.confidence;
  if (claim.effectiveDate !== undefined) {
    canonical.effectiveDate = claim.effectiveDate instanceof Date 
      ? claim.effectiveDate.toISOString() 
      : claim.effectiveDate;
  }
  if (claim.howKnown !== undefined) canonical.howKnown = claim.howKnown;
  if (claim.score !== undefined) canonical.score = claim.score;
  if (claim.sourceURI !== undefined) canonical.sourceURI = claim.sourceURI;
  if (claim.stars !== undefined) canonical.stars = claim.stars;
  if (claim.statement !== undefined) canonical.statement = claim.statement;
  if (claim.unit !== undefined) canonical.unit = claim.unit;
  
  // Return deterministic JSON (sorted keys, no extra spaces)
  return JSON.stringify(canonical, Object.keys(canonical).sort());
}

/**
 * Creates the message to be signed for a claim.
 * Different signing methods may wrap this differently.
 */
export interface SigningMessage {
  claim: any;
  proof: Omit<LinkedClaimProof, 'proofValue'>;
}

/**
 * Prepares a claim for signing by combining it with proof metadata
 */
export function prepareForSigning(
  claim: LinkedClaim,
  proofMetadata: Omit<LinkedClaimProof, 'proofValue'>
): string {
  const canonicalClaim = JSON.parse(canonicalizeClaim(claim));
  
  const message: SigningMessage = {
    claim: canonicalClaim,
    proof: proofMetadata
  };
  
  // Use 2-space indentation for readability in proof
  return JSON.stringify(message, null, 2);
}

/**
 * Extracts the signer ID from a proof
 */
export function getSignerFromProof(proof: LinkedClaimProof): string {
  // For DIDs, the verificationMethod is the signer
  if (proof.verificationMethod.startsWith('did:')) {
    return proof.verificationMethod.split('#')[0]; // Remove key fragment
  }
  
  // For Ethereum addresses in the proof
  if (proof.ethereumAddress) {
    return `did:pkh:eip155:1:${proof.ethereumAddress}`;
  }
  
  // For server keys, extract from the verification method URL
  if (proof.verificationMethod.includes('/keys/')) {
    // Return the base URL as the "signer" (the server)
    return new URL(proof.verificationMethod).origin;
  }
  
  return proof.verificationMethod;
}

/**
 * Validates that a claim has required fields
 */
export function validateClaim(claim: any): claim is LinkedClaim {
  return (
    typeof claim.subject === 'string' &&
    typeof claim.claim === 'string' &&
    claim.subject.length > 0 &&
    claim.claim.length > 0
  );
}

/**
 * Server-specific signing wrapper
 */
export interface ServerSigningContext {
  keyId: string;
  authMethod: 'google-oauth' | 'password' | 'api-token';
  authenticatedUser: string; // The user the server is signing for
}

export function prepareServerSigning(
  claim: LinkedClaim,
  context: ServerSigningContext
): { message: string; proof: LinkedClaimProof } {
  const proof: Omit<LinkedClaimProof, 'proofValue'> = {
    type: 'Ed25519Signature2020',
    created: new Date().toISOString(),
    verificationMethod: context.keyId,
    proofPurpose: 'assertionMethod',
    authenticationMethod: context.authMethod,
    // Note: authenticatedUser is recorded but not the issuerId
    // The server is the signer, acting on behalf of the user
  };
  
  const message = prepareForSigning(claim, proof);
  
  return {
    message,
    proof: proof as LinkedClaimProof
  };
}

/**
 * DID/Ethereum signing wrapper
 */
export interface DIDSigningContext {
  signerDID?: string;
  signerAddress: string;
  timestamp?: string;
}

export function prepareDIDSigning(
  claim: LinkedClaim,
  context: DIDSigningContext
): { message: string; proof: Omit<LinkedClaimProof, 'proofValue'> } {
  // For Ethereum signing, we use a simpler message format
  const canonicalClaim = JSON.parse(canonicalizeClaim(claim));
  
  const message = JSON.stringify({
    ...canonicalClaim,
    timestamp: context.timestamp || new Date().toISOString(),
    signer: context.signerAddress
  });
  
  const proof: Omit<LinkedClaimProof, 'proofValue'> = {
    type: 'EthereumEip712Signature2021',
    created: new Date().toISOString(),
    verificationMethod: context.signerDID || `did:pkh:eip155:1:${context.signerAddress}`,
    proofPurpose: 'assertionMethod',
    ethereumAddress: context.signerAddress
  };
  
  return { message, proof };
}

/**
 * Reconstruct the exact message that was signed for verification
 */
export function reconstructSignedMessage(
  claim: any,
  proof: LinkedClaimProof
): string {
  // Remove fields that shouldn't be in the canonical claim
  const { issuerId, issuerIdType, proof: _, ...claimForSigning } = claim;
  
  if (proof.type === 'Ed25519Signature2020') {
    // Server signing format
    const { proofValue, ...proofWithoutSignature } = proof;
    return prepareForSigning(claimForSigning as LinkedClaim, proofWithoutSignature);
  } else if (proof.type === 'EthereumEip712Signature2021') {
    // Ethereum signing format - need to reconstruct the simpler message
    const canonicalClaim = JSON.parse(canonicalizeClaim(claimForSigning as LinkedClaim));
    
    // Try to extract timestamp from proof or use the created date
    const timestamp = (proof as any).timestamp || proof.created;
    
    return JSON.stringify({
      ...canonicalClaim,
      timestamp,
      signer: proof.ethereumAddress
    });
  }
  
  throw new Error(`Unknown proof type: ${proof.type}`);
}

// Re-export types that implementations might need
export type { HowKnown } from '@prisma/client';
