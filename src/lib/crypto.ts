import crypto from 'crypto';
import { Claim } from '@prisma/client';
import { 
  LinkedClaim, 
  prepareServerSigning, 
  ServerSigningContext 
} from './sign-linked-claim';

interface ServerKeyPair {
  publicKey: string;
  privateKey: string;
  keyId: string;
}

// Initialize server key pair (in production, load from secure storage)
let serverKeyPair: ServerKeyPair;

export function initializeServerKeys() {
  // In production, load from environment or key management service
  // For now, generate new keys if not exists
  if (process.env.SERVER_PRIVATE_KEY && process.env.SERVER_PUBLIC_KEY) {
    serverKeyPair = {
      publicKey: process.env.SERVER_PUBLIC_KEY,
      privateKey: process.env.SERVER_PRIVATE_KEY,
      keyId: `${process.env.BASE_URL || 'https://linkedtrust.us'}/keys/server-key-1`
    };
    console.log('Loaded server keys from environment');
  } else {
    // Generate new key pair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    
    serverKeyPair = {
      publicKey,
      privateKey,
      keyId: `${process.env.BASE_URL || 'https://linkedtrust.us'}/keys/server-key-1`
    };
    
    console.log('Generated new server keys');
    console.log('Add these to your environment:');
    console.log(`SERVER_PUBLIC_KEY="${publicKey.replace(/\n/g, '\\n')}"`);
    console.log(`SERVER_PRIVATE_KEY="${privateKey.replace(/\n/g, '\\n')}"`);
  }
}

export async function signClaimWithServerKey(
  claim: Partial<Claim>,
  authMethod: 'google-oauth' | 'password' | 'api-token'
): Promise<string> {
  if (!serverKeyPair) {
    initializeServerKeys();
  }
  
  // Convert Claim to LinkedClaim format (excluding non-canonical fields)
  const linkedClaim: LinkedClaim = {
    subject: claim.subject!,
    claim: claim.claim!,
    object: claim.object || undefined,
    statement: claim.statement || undefined,
    effectiveDate: claim.effectiveDate || undefined,
    sourceURI: claim.sourceURI || undefined,
    howKnown: claim.howKnown || undefined,
    confidence: claim.confidence ?? undefined,
    aspect: claim.aspect || undefined,
    stars: claim.stars || undefined,
    score: claim.score || undefined,
    amt: claim.amt || undefined,
    unit: claim.unit || undefined
  };
  
  // Prepare signing context
  const context: ServerSigningContext = {
    keyId: serverKeyPair.keyId,
    authMethod,
    authenticatedUser: claim.issuerId || 'anonymous'
  };
  
  // Get the canonical message and proof metadata
  const { message, proof } = prepareServerSigning(linkedClaim, context);
  
  // Sign the message
  const sign = crypto.createSign('SHA256');
  sign.update(message);
  sign.end();
  const signature = sign.sign(serverKeyPair.privateKey, 'base64');
  
  // Add signature to proof
  proof.proofValue = signature;
  
  return JSON.stringify(proof);
}

export function getServerPublicKey(): { keyId: string; publicKey: string } {
  if (!serverKeyPair) {
    initializeServerKeys();
  }
  return {
    keyId: serverKeyPair.keyId,
    publicKey: serverKeyPair.publicKey
  };
}

// Verify a claim signature (for testing/validation)
export async function verifyClaimSignature(
  claim: any,
  proof: any
): Promise<boolean> {
  try {
    const proofObj = typeof proof === 'string' ? JSON.parse(proof) : proof;
    const { proofValue } = proofObj;
    
    // Recreate the message that was signed using the library
    const { reconstructSignedMessage } = await import('./sign-linked-claim');
    const message = reconstructSignedMessage(claim, proofObj);
    
    // Verify the signature
    const verify = crypto.createVerify('SHA256');
    verify.update(message);
    verify.end();
    
    return verify.verify(serverKeyPair.publicKey, proofValue, 'base64');
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}
