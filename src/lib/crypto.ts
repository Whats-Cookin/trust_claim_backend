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
  try {
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
      // Try to generate new key pair
      try {
        // Try ED25519 first (preferred)
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        
        serverKeyPair = {
          publicKey,
          privateKey,
          keyId: `${process.env.BASE_URL || 'https://linkedtrust.us'}/keys/server-key-1`
        };
        
        console.log('Generated new ED25519 server keys');
      } catch (ed25519Error) {
        console.warn('ED25519 not supported, falling back to RSA:', ed25519Error);
        
        // Fallback to RSA
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        
        serverKeyPair = {
          publicKey,
          privateKey,
          keyId: `${process.env.BASE_URL || 'https://linkedtrust.us'}/keys/server-key-1`
        };
        
        console.log('Generated new RSA server keys');
      }
      
      console.log('Add these to your environment:');
      console.log(`SERVER_PUBLIC_KEY="${serverKeyPair.publicKey.replace(/\n/g, '\\n')}"`);
      console.log(`SERVER_PRIVATE_KEY="${serverKeyPair.privateKey.replace(/\n/g, '\\n')}"`);
    }
  } catch (error) {
    console.error('Failed to initialize server keys:', error);
    // Create dummy keys so the server doesn't crash
    serverKeyPair = {
      publicKey: 'dummy-public-key',
      privateKey: 'dummy-private-key',
      keyId: `${process.env.BASE_URL || 'https://linkedtrust.us'}/keys/server-key-1`
    };
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
  
  // Sign the message based on key type
  let signature: string;

  // Keys from .env may have escaped newlines; PKCS8 PEM headers don't name the
  // algorithm, so detect the key type from the parsed key rather than the text
  const privateKey = crypto.createPrivateKey(serverKeyPair.privateKey.replace(/\\n/g, '\n'));
  if (privateKey.asymmetricKeyType === 'ed25519') {
    signature = crypto.sign(null, Buffer.from(message), privateKey).toString('base64');
  } else {
    // For RSA or other keys, use the traditional approach
    const sign = crypto.createSign('SHA256');
    sign.update(message);
    sign.end();
    signature = sign.sign(privateKey, 'base64');
  }
  
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
    
    // Recreate the message that was signed using the library.
    // DB rows carry nulls for absent fields, but the canonical form only
    // omits undefined — drop nulls so reconstruction matches what was signed.
    const { reconstructSignedMessage } = await import('./sign-linked-claim');
    const cleanedClaim = Object.fromEntries(
      Object.entries(claim).filter(([, v]) => v !== null)
    );
    const message = reconstructSignedMessage(cleanedClaim, proofObj);
    
    // Keys from .env may have escaped newlines; detect the key type from the
    // parsed key rather than the PEM text (PKCS8/SPKI headers don't name it)
    const publicKey = crypto.createPublicKey(serverKeyPair.publicKey.replace(/\\n/g, '\n'));
    if (publicKey.asymmetricKeyType === 'ed25519') {
      return crypto.verify(null, Buffer.from(message), publicKey, Buffer.from(proofValue, 'base64'));
    } else {
      // For RSA or other keys, use the traditional approach
      const verify = crypto.createVerify('SHA256');
      verify.update(message);
      verify.end();

      return verify.verify(publicKey, proofValue, 'base64');
    }
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}
