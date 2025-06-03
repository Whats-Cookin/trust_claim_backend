# sign-linked-claim

Reference implementation for signing LinkedClaims according to the LinkedClaims specification.

## Overview

This library provides canonical serialization and signing for linked claims, ensuring consistent and verifiable claim signatures across different implementations.

## Key Concepts

### What Gets Signed

A LinkedClaim includes:
- **Core triple**: subject, claim, object
- **Content**: statement, effectiveDate, sourceURI, howKnown
- **Confidence**: The signer's confidence level (0-1) at time of signing
- **Measurements**: aspect, stars, score, amt, unit

What's NOT included in the signature:
- **issuerId**: Derived from the signature/proof
- **proof**: Contains the signature itself

### Signing Methods

1. **Server Signing** (Ed25519)
   - Server signs on behalf of authenticated users
   - Records authentication method (oauth, password, etc)
   - Uses 2-space indented JSON for readability

2. **DID/Ethereum Signing** 
   - User signs directly with their wallet
   - Compact JSON format with timestamp
   - Ethereum address included for verification

## Usage

### Backend (Node.js)

```typescript
import { 
  LinkedClaim, 
  prepareServerSigning, 
  ServerSigningContext 
} from 'sign-linked-claim';

// Prepare claim for signing
const claim: LinkedClaim = {
  subject: 'https://example.com/users/alice',
  claim: 'ENDORSES',
  object: 'https://example.com/projects/1',
  statement: 'This project demonstrates excellent work',
  confidence: 0.95,
  effectiveDate: new Date()
};

// Server signing context
const context: ServerSigningContext = {
  keyId: 'https://myserver.com/keys/1',
  authMethod: 'google-oauth',
  authenticatedUser: 'alice@example.com'
};

// Get canonical message and proof metadata
const { message, proof } = prepareServerSigning(claim, context);

// Sign with your server key
const signature = signWithServerKey(message);
proof.proofValue = signature;
```

### Frontend (Browser)

```typescript
import { 
  LinkedClaim,
  toLinkedClaim,
  prepareDIDSigning,
  DIDSigningContext 
} from 'sign-linked-claim';

// Convert raw claim to LinkedClaim
const linkedClaim = toLinkedClaim(rawClaimData);

// DID signing context
const context: DIDSigningContext = {
  signerAddress: '0x1234...',
  signerDID: 'did:ethr:0x1234...'
};

// Get message for signing
const { message, proof } = prepareDIDSigning(linkedClaim, context);

// Sign with MetaMask
const signature = await signer.signMessage(message);
proof.proofValue = signature;
```

### Verification

```typescript
import { reconstructSignedMessage } from 'sign-linked-claim';

// Recreate the exact message that was signed
const originalMessage = reconstructSignedMessage(claim, proof);

// Verify signature based on proof type
if (proof.type === 'Ed25519Signature2020') {
  // Verify against server public key
} else if (proof.type === 'EthereumEip712Signature2021') {
  // Recover signer address and verify
}
```

## Canonical Serialization

The library ensures deterministic JSON serialization:
- Keys are sorted alphabetically
- Undefined values are omitted
- Dates are converted to ISO strings
- Minimal format for signatures (no extra whitespace except for server signing)

## License

MIT

## Contributing

This is a reference implementation for the LinkedClaims specification. Contributions and feedback are welcome.
