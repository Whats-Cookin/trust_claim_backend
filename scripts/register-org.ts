/**
 * register-org.ts — register an organization as a credential issuer.
 *
 * Creates (idempotently):
 *   1. An ORGANIZATION Node + UriEntity for the org URI
 *   2. A root-signed HAS_CAPABILITY claim (aspect: credential-issuer)
 *      designating the org as a registered issuer on linkedtrust.us,
 *      signed custodially with LT_ROOT_PRIVATE_KEY (same pattern as
 *      issue-root-capability.ts).
 *
 *   ts-node scripts/register-org.ts \
 *     --uri https://live.linkedtrust.us/orgs/ai-trailblazers \
 *     --name "AI Trailblazers" \
 *     --description "..." [--image <url>]
 */
import 'dotenv/config';
import crypto from 'crypto';
import { prepareServerSigning } from '../src/lib/sign-linked-claim';
import { prisma } from '../src/lib/prisma';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const uri = arg('--uri');
  const name = arg('--name');
  const description = arg('--description') || '';
  const image = arg('--image');
  if (!uri || !name) {
    console.error('Required: --uri <org-uri> --name <org-name> [--description ...] [--image <url>]');
    process.exit(1);
  }

  const rootDid = process.env.LT_ROOT_DID || '';
  const privatePem = (process.env.LT_ROOT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!rootDid || !privatePem) {
    console.error('LT_ROOT_PRIVATE_KEY / LT_ROOT_DID missing from .env — run issue-root-capability.ts first.');
    process.exit(1);
  }

  // 1. Node
  let node = await prisma.node.findUnique({ where: { nodeUri: uri } });
  if (node) {
    console.log(`Node already exists (id=${node.id}).`);
  } else {
    node = await prisma.node.create({
      data: { nodeUri: uri, name, entType: 'ORGANIZATION', descrip: description, image: image || null }
    });
    console.log(`Created ORGANIZATION node id=${node.id} for ${uri}`);
  }

  const uriEntity = await prisma.uriEntity.findUnique({ where: { uri } });
  if (!uriEntity) {
    await prisma.uriEntity.create({
      data: { uri, entityType: 'ORGANIZATION', entityTable: 'Node', entityId: String(node.id), name }
    });
    console.log('Created UriEntity for org URI.');
  }

  // 2. Root-signed registration claim
  const existing = await prisma.claim.findFirst({
    where: { subject: uri, claim: 'HAS_CAPABILITY', object: 'linkedtrust.us', aspect: 'credential-issuer' }
  });
  if (existing) {
    console.log(`Issuer capability claim already exists (id=${existing.id}). Nothing to do.`);
    return;
  }

  const linkedClaim = {
    subject: uri,
    claim: 'HAS_CAPABILITY',
    object: 'linkedtrust.us',
    aspect: 'credential-issuer',
    statement: `${name} is a registered credential-issuing organization on linkedtrust.us.`,
    howKnown: 'SIGNED_DOCUMENT',
    confidence: 1.0,
    effectiveDate: new Date()
  } as any;

  const { message, proof } = prepareServerSigning(linkedClaim, {
    keyId: rootDid,
    authMethod: 'api-token',
    authenticatedUser: rootDid
  } as any);
  const signature = crypto.sign(null, Buffer.from(message), privatePem).toString('base64');
  (proof as any).proofValue = signature;

  const created = await prisma.claim.create({
    data: {
      subject: uri,
      claim: 'HAS_CAPABILITY',
      object: 'linkedtrust.us',
      aspect: 'credential-issuer',
      statement: linkedClaim.statement,
      howKnown: 'SIGNED_DOCUMENT',
      confidence: 1.0,
      effectiveDate: linkedClaim.effectiveDate,
      issuerId: rootDid,
      issuerIdType: 'DID',
      proof: JSON.stringify(proof)
    }
  });

  const pubPem = (process.env.LT_ROOT_PUBLIC_KEY || '').replace(/\\n/g, '\n');
  const ok = pubPem
    ? crypto.verify(null, Buffer.from(message), pubPem, Buffer.from(signature, 'base64'))
    : null;

  console.log('Issuer registration claim created:');
  console.log('  id:        ', created.id);
  console.log('  subject:   ', uri);
  console.log('  signature: ', ok === null ? '(no pub key to self-check)' : ok ? 'VERIFIED ✓' : 'FAILED ✗');
}

main()
  .catch(e => {
    console.error('ERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
