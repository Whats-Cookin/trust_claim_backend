/**
 * Mint a single-use "Sign in with LinkedTrust" SSO invite link.
 *
 *   npx ts-node scripts/make-sso-invite.ts --email user@example.com [--days 14]
 *
 * The link logs the recipient into the LinkedTrust account that owns that email
 * (creating the binding if none exists), so a relying app like Taiga matches their
 * existing account. The invite is a JWT signed with ACCESS_SECRET and is single-use
 * (enforced server-side via the sso_invites table at /oauth/bind-invite).
 *
 * SECURITY: there is no HTTP route that mints invites. A valid invite can only be
 * produced by running this script, which requires the server's ACCESS_SECRET — i.e.
 * shell access to the host. Only the admin can create invites. Send links privately.
 */
import 'dotenv/config';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function main() {
  const email = arg('--email');
  const days = Number(arg('--days') || '14');
  if (!email || !email.includes('@')) {
    console.error('Required: --email <email> [--days <n, default 14>]');
    process.exit(1);
  }
  const secret = process.env.SSO_INVITE_SECRET;
  if (!secret) {
    console.error('SSO_INVITE_SECRET not found in environment (.env). Cannot sign invite.');
    process.exit(1);
  }
  const base = process.env.BASE_URL || 'https://live.linkedtrust.us';
  const jti = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign({ typ: 'sso_invite', email, jti }, secret, { expiresIn: `${days}d` });

  console.log('SSO invite (single-use):');
  console.log('  email:    ', email);
  console.log('  expires:  ', `${days} days`);
  console.log('  link:     ', `${base}/sso-invite?token=${token}`);
}

main();
