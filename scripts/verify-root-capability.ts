/**
 * verify-root-capability.ts — verify a stored capability claim's signature
 * against the configured root key (LT_ROOT_PUBLIC_KEY) and confirm its
 * verificationMethod matches LT_ROOT_DID. Mirrors what resolveTrustSignal will do.
 *
 *   ts-node scripts/verify-root-capability.ts --id 124548
 */
import 'dotenv/config';
import crypto from 'crypto';
import { prepareForSigning } from '../src/lib/sign-linked-claim';
import { prisma } from '../src/lib/prisma';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const id = Number(arg('--id'));
  const claim = await prisma.claim.findUnique({ where: { id } });
  if (!claim || !claim.proof) {
    console.error('claim or proof not found');
    process.exit(1);
  }
  const proof = JSON.parse(claim.proof as string);
  const proofValue = proof.proofValue;
  const proofMeta = { ...proof };
  delete proofMeta.proofValue;

  const linkedClaim = {
    subject: claim.subject,
    claim: claim.claim,
    object: claim.object || undefined,
    aspect: claim.aspect || undefined,
    statement: claim.statement || undefined,
    howKnown: (claim.howKnown as any) || undefined,
    confidence: claim.confidence ?? undefined,
    effectiveDate: claim.effectiveDate || undefined,
  };

  const message = prepareForSigning(linkedClaim as any, proofMeta);
  const pubPem = (process.env.LT_ROOT_PUBLIC_KEY || '').replace(/\\n/g, '\n');
  const sigOk = crypto.verify(null, Buffer.from(message), pubPem, Buffer.from(proofValue, 'base64'));
  const methodOk = proof.verificationMethod === process.env.LT_ROOT_DID;

  console.log('claim id:           ', id);
  console.log('subject:            ', claim.subject);
  console.log('verificationMethod: ', proof.verificationMethod);
  console.log('matches LT_ROOT_DID:', methodOk);
  console.log('signature valid:    ', sigOk);
  console.log('=> trusted root cap:', sigOk && methodOk ? 'YES ✓' : 'NO ✗');
}

main()
  .catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
