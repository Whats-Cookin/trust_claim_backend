/**
 * issue-root-capability.ts — "for now" custodial trust-root bootstrap.
 *
 * Generates (once) a dedicated server ROOT key, persists it to .env as
 * LT_ROOT_PRIVATE_KEY / LT_ROOT_PUBLIC_KEY / LT_ROOT_DID (a did:key), and signs
 * a capability claim designating a subject DID as a trust-root for an org.
 *
 *   ts-node scripts/issue-root-capability.ts \
 *     --subject did:plc:3akk2lpjh6vz7yr74j2wgjk6 --org linkedtrust.us
 *
 * The server is the SIGNER (custodial); the subject DID is only the identifier
 * of who is enabled. Signature verifies against LT_ROOT_DID (self-certifying
 * did:key), so no key registry is needed downstream (resolveTrustSignal).
 *
 * NOTE: keys live in .env as plaintext for now. Proper secure custody (KMS /
 * encryption at rest / robust key-exchange library) is tracked in
 * docs/custodial-keys-plan.md and is the intended replacement.
 */
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prepareServerSigning } from '../src/lib/sign-linked-claim';
import { prisma } from '../src/lib/prisma';

const ENV_PATH = path.resolve(__dirname, '../.env');

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

// base58btc (Bitcoin alphabet) — for did:key encoding.
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58btc(buf: Buffer): string {
  const digits = [0];
  for (const byte of buf) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  for (const b of buf) {
    if (b === 0) out += '1';
    else break;
  }
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

function didKeyFromEd25519Spki(pubPem: string): string {
  const der = crypto.createPublicKey(pubPem).export({ format: 'der', type: 'spki' }) as Buffer;
  const raw = der.subarray(der.length - 32); // last 32 bytes = raw ed25519 pubkey
  const prefixed = Buffer.concat([Buffer.from([0xed, 0x01]), raw]); // multicodec ed25519-pub
  return 'did:key:z' + base58btc(prefixed);
}

function ensureRootKey(): { privatePem: string; did: string } {
  let priv = (process.env.LT_ROOT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  let did = process.env.LT_ROOT_DID || '';
  if (priv && did) {
    console.log('Using existing root key from env. LT_ROOT_DID =', did);
    return { privatePem: priv, did };
  }
  console.log('No root key found — generating a new ed25519 root key...');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  did = didKeyFromEd25519Spki(publicKey);
  const esc = (s: string) => s.trim().replace(/\n/g, '\\n');
  const block =
    '\n# Server trust-root key (custodial signer). See docs/custodial-keys-plan.md.\n' +
    `LT_ROOT_PRIVATE_KEY="${esc(privateKey)}"\n` +
    `LT_ROOT_PUBLIC_KEY="${esc(publicKey)}"\n` +
    `LT_ROOT_DID="${did}"\n`;
  fs.appendFileSync(ENV_PATH, block);
  process.env.LT_ROOT_PRIVATE_KEY = esc(privateKey);
  process.env.LT_ROOT_DID = did;
  console.log('Generated root key and appended to .env. LT_ROOT_DID =', did);
  return { privatePem: privateKey, did };
}

async function main() {
  const subject = arg('--subject');
  const org = arg('--org');
  if (!subject || !org) {
    console.error('Required: --subject <did> --org <org-domain>');
    process.exit(1);
  }

  const { privatePem, did: rootDid } = ensureRootKey();

  const linkedClaim = {
    subject,
    claim: 'HAS_CAPABILITY',
    object: org,
    aspect: 'trust-root',
    statement: `Designated a trust root for ${org} by the LinkedTrust server root key.`,
    howKnown: 'SIGNED_DOCUMENT',
    confidence: 1.0,
    effectiveDate: new Date(),
  } as any;

  // Idempotency: don't issue a duplicate capability for the same subject/org.
  const existing = await prisma.claim.findFirst({
    where: { subject, claim: 'HAS_CAPABILITY', object: org, aspect: 'trust-root' },
  });
  if (existing) {
    console.log(`Capability claim already exists (id=${existing.id}). Nothing to do.`);
    return;
  }

  // Custodial signing: server root key signs; verificationMethod = root did:key.
  const { message, proof } = prepareServerSigning(linkedClaim, {
    keyId: rootDid,
    authMethod: 'api-token',
    authenticatedUser: rootDid,
  } as any);
  const signature = crypto.sign(null, Buffer.from(message), privatePem).toString('base64');
  (proof as any).proofValue = signature;

  const created = await prisma.claim.create({
    data: {
      subject,
      claim: 'HAS_CAPABILITY',
      object: org,
      aspect: 'trust-root',
      statement: linkedClaim.statement,
      howKnown: 'SIGNED_DOCUMENT',
      confidence: 1.0,
      effectiveDate: linkedClaim.effectiveDate,
      issuerId: rootDid,
      issuerIdType: 'DID',
      proof: JSON.stringify(proof),
    },
  });

  // Self-check: verify the signature against the root public key.
  const pubPem = (process.env.LT_ROOT_PUBLIC_KEY || '').replace(/\\n/g, '\n');
  const ok = pubPem
    ? crypto.verify(null, Buffer.from(message), pubPem, Buffer.from(signature, 'base64'))
    : null;

  console.log('Capability claim issued:');
  console.log('  id:        ', created.id);
  console.log('  subject:   ', subject);
  console.log('  claim:     ', 'HAS_CAPABILITY ->', org, '(aspect: trust-root)');
  console.log('  issuer:    ', rootDid);
  console.log('  signature: ', ok === null ? '(no pub key to self-check)' : ok ? 'VERIFIED ✓' : 'FAILED ✗');
}

main()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
