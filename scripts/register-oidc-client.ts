/**
 * Register an OIDC client ("Sign in with LinkedTrust" relying app).
 *
 *   npx ts-node scripts/register-oidc-client.ts \
 *     --name "Marten" \
 *     --redirect https://marten.linkedtrust.us/oauth/callback \
 *     [--redirect <more>] [--public] [--scopes "openid profile email trust"]
 *
 * Confidential clients (default) get a generated secret printed ONCE — it is
 * stored only as a bcrypt hash. Public clients (--public) get no secret and must
 * use PKCE. End users never need any of this; only relying apps do.
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function args(flag: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === flag) out.push(process.argv[i + 1]);
  });
  return out;
}

async function main() {
  const name = arg('--name');
  const redirectUris = args('--redirect');
  const isPublic = process.argv.includes('--public');
  const scopes = (arg('--scopes') || 'openid profile email trust').split(/\s+/).filter(Boolean);

  if (!name || redirectUris.length === 0) {
    console.error('Required: --name <name> --redirect <uri> [--redirect <uri> ...] [--public] [--scopes "..."]');
    process.exit(1);
  }

  const clientId = `lt_${crypto.randomBytes(12).toString('hex')}`;
  let plaintextSecret = '';
  let clientSecret = '';
  if (!isPublic) {
    plaintextSecret = crypto.randomBytes(32).toString('base64url');
    clientSecret = await bcrypt.hash(plaintextSecret, 10);
  }

  await prisma.oidcClient.create({
    data: { clientId, clientSecret, name, redirectUris, allowedScopes: scopes, isPublic },
  });

  console.log('Registered OIDC client:');
  console.log('  name:           ', name);
  console.log('  client_id:      ', clientId);
  console.log('  type:           ', isPublic ? 'public (PKCE, no secret)' : 'confidential');
  if (!isPublic) console.log('  client_secret:  ', plaintextSecret, '  <-- shown once, store it now');
  console.log('  redirect_uris:  ', redirectUris.join(', '));
  console.log('  allowed_scopes: ', scopes.join(' '));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
