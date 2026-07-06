/**
 * issue-workshop-certs.ts — issue certificate credentials with magic-link offers.
 *
 * For each recipient: creates a Credential (OpenBadges-style), a UriEntity,
 * and a CredentialOffer (single-use magic-link token, sha256-hashed at rest).
 * Prints the claim link and permanent cert URL. Does NOT send email.
 *
 *   ts-node scripts/issue-workshop-certs.ts --name "Jane Doe" [--email jane@x.com]
 *   ts-node scripts/issue-workshop-certs.ts --batch recipients.json
 *
 * recipients.json: [{ "name": "...", "email": "..." (optional) }, ...]
 */
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import { prisma } from '../src/lib/prisma';

const ORG_URI = 'https://live.linkedtrust.us/orgs/ai-trailblazers';
const ORG_NAME = 'AI Trailblazers';
const TEMPLATE_ID = 'ai-trailblazers-build-with-ai';
const ACHIEVEMENT_NAME = 'Build with AI in 2 Hours-No code Needed';
const ACHIEVEMENT_DESCRIPTION =
  'Successfully completed the AI Trailblazers Saturday workshop "Build with AI in 2 Hours-No code Needed", June 27th, 2026, Woods Memorial Library, Tucson, AZ.';
const CRITERIA =
  'Workshop Platform: Claude Code by Anthropic. Skills demonstrated: AI-assisted development, prompt-driven application building, Create-Save-Test workflow, web page creation fundamentals, human-AI collaboration.';
const SKILLS = [
  'AI-assisted development',
  'Prompt-driven application building',
  'Create · Save · Test workflow',
  'Web page creation fundamentals',
  'Human-AI collaboration'
];
const EFFECTIVE_DATE = new Date('2026-06-27T12:00:00-07:00'); // workshop date
const OFFER_TTL_DAYS = 90;
const CERTS_BASE = 'https://live.linkedtrust.us/certs';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function issueOne(recipient: { name: string; email?: string }) {
  const uuid = crypto.randomUUID();
  const credentialId = `urn:uuid:${uuid}`;
  const issuanceDate = EFFECTIVE_DATE;

  const credentialSubject = {
    id: recipient.email ? `mailto:${recipient.email}` : undefined,
    name: recipient.name,
    achievement: {
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['Achievement'],
      name: ACHIEVEMENT_NAME,
      description: ACHIEVEMENT_DESCRIPTION,
      criteria: { narrative: CRITERIA }
    },
    skills: SKILLS
  };

  await prisma.credential.create({
    data: {
      id: credentialId,
      canonicalUri: credentialId,
      name: ACHIEVEMENT_NAME,
      credentialSchema: 'OpenBadges',
      context: [
        'https://www.w3.org/2018/credentials/v1',
        'https://purl.imsglobal.org/spec/ob/v3p0/context.json'
      ],
      type: ['VerifiableCredential', 'OpenBadgeCredential'],
      issuer: { id: ORG_URI, name: ORG_NAME },
      issuanceDate,
      credentialSubject,
      proof: {},
      sameAs: {
        templateId: TEMPLATE_ID,
        createdFor: recipient.email || null,
        assignmentPending: true
      }
    }
  });

  await prisma.uriEntity.create({
    data: {
      uri: credentialId,
      entityType: 'CREDENTIAL',
      entityTable: 'Credential',
      entityId: credentialId,
      name: `${ACHIEVEMENT_NAME} — ${recipient.name}`
    }
  });

  const token = crypto.randomBytes(24).toString('hex'); // 48 hex chars
  await prisma.credentialOffer.create({
    data: {
      credentialId,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      recipientName: recipient.name,
      recipientEmail: recipient.email || null,
      issuerOrgUri: ORG_URI,
      expiresAt: new Date(Date.now() + OFFER_TTL_DAYS * 24 * 60 * 60 * 1000)
    }
  });

  return {
    name: recipient.name,
    email: recipient.email || '',
    certUrl: `${CERTS_BASE}/cert/${uuid}`,
    claimLink: `${CERTS_BASE}/claim/${token}`
  };
}

async function main() {
  let recipients: { name: string; email?: string }[] = [];
  const batch = arg('--batch');
  if (batch) {
    recipients = JSON.parse(fs.readFileSync(batch, 'utf8'));
  } else {
    const name = arg('--name');
    if (!name) {
      console.error('Required: --name "Full Name" [--email x@y.z]  OR  --batch recipients.json');
      process.exit(1);
    }
    recipients = [{ name, email: arg('--email') }];
  }

  for (const r of recipients) {
    // Idempotency: skip if an unclaimed offer already exists for this name+achievement
    const existing = await prisma.credentialOffer.findFirst({
      where: { recipientName: r.name, issuerOrgUri: ORG_URI, claimedAt: null }
    });
    if (existing) {
      console.log(`SKIP (offer already exists): ${r.name} — cert ${existing.credentialId}`);
      continue;
    }
    const out = await issueOne(r);
    console.log(`\n${out.name}${out.email ? ` <${out.email}>` : ''}`);
    console.log(`  cert:  ${out.certUrl}`);
    console.log(`  claim: ${out.claimLink}`);
  }
}

main()
  .catch(e => {
    console.error('ERROR:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
