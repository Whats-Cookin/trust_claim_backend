// OIDC provider endpoints — "Sign in with LinkedTrust".
//
// All additive. Existing /auth/* login routes are untouched. Identity is
// federated in through the existing frontend login (Google / Bluesky / etc.);
// this layer issues standard OIDC codes/tokens and a trust signal on top.

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import * as oidc from '../lib/oidc';

const SESSION_COOKIE = 'lt_idp_session';
const CODE_TTL_MS = 5 * 60 * 1000;
// Durable "stay logged in" session — long-lived + slid forward on each use so an
// active user effectively never has to re-authenticate (Google-grade SSO).
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_TTL_JWT = '30d';
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.BASE_URL || 'https://dev.linkedtrust.us';
const ACCESS_SECRET = process.env.ACCESS_SECRET || 'access-secret';
// Dedicated secret for SSO invites — NO insecure fallback. If unset, invites are
// disabled (fail closed) rather than verifiable with a guessable default. This is
// what makes invites mintable only by someone with this server's .env.
const INVITE_SECRET = process.env.SSO_INVITE_SECRET;

// ── cookie helpers (single cookie; avoids a global cookie-parser middleware) ──
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

function setSessionCookie(res: Response, userId: number): void {
  const token = jwt.sign({ userId, type: 'idp_session' }, ACCESS_SECRET, { expiresIn: SESSION_TTL_JWT });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

function sessionUserId(req: Request): number | null {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    if (decoded.type !== 'idp_session') return null;
    return Number(decoded.userId);
  } catch {
    return null;
  }
}

// Build the set of granted scopes. `trust` and `openid` are always granted when
// the client is allowed them — LinkedTrust returns a trust signal by default.
function grantScopes(requested: string | undefined, allowed: string[]): string[] {
  const base = requested ? requested.split(/\s+/).filter(Boolean) : oidc.DEFAULT_SCOPES;
  const wanted = new Set([...base, 'openid', 'trust']);
  return [...wanted].filter((s) => allowed.includes(s));
}

// ── discovery + jwks ─────────────────────────────────────────────────────────
export function discovery(_req: Request, res: Response): void {
  res.json(oidc.discoveryDocument());
}

export async function jwksHandler(_req: Request, res: Response): Promise<void> {
  res.json(await oidc.jwks());
}

// ── /oauth/client/:clientId ───────────────────────────────────────────────────
// Public display details for the per-client sign-in page. Name and host only —
// never the secret. Lets the page show "Continue to workers.vc" without taking
// the app name from a query parameter an attacker could craft.
export async function clientInfo(req: Request, res: Response): Promise<void> {
  const { clientId } = req.params as Record<string, string>;
  const client = clientId ? await prisma.oidcClient.findUnique({ where: { clientId } }) : null;
  if (!client) {
    res.status(404).json({ error: 'unknown_client' });
    return;
  }

  let host: string | null = null;
  try {
    if (client.redirectUris[0]) host = new URL(client.redirectUris[0]).host;
  } catch {
    /* leave null — the page falls back to the name alone */
  }

  res.json({ clientId: client.clientId, name: client.name || host || 'this app', host });
}

// ── /oauth/authorize ──────────────────────────────────────────────────────────
export async function authorize(req: Request, res: Response): Promise<void> {
  const { client_id, redirect_uri, response_type, scope, state, nonce, code_challenge, code_challenge_method } =
    req.query as Record<string, string>;

  const client = client_id ? await prisma.oidcClient.findUnique({ where: { clientId: client_id } }) : null;
  // Invalid client or redirect_uri: must NOT redirect anywhere — show an error.
  if (!client) {
    res.status(400).json({ error: 'invalid_client', error_description: 'unknown client_id' });
    return;
  }
  if (!redirect_uri || !client.redirectUris.includes(redirect_uri)) {
    res.status(400).json({ error: 'invalid_request', error_description: 'redirect_uri not registered for this client' });
    return;
  }

  const fail = (error: string, description?: string) => {
    const url = new URL(redirect_uri);
    url.searchParams.set('error', error);
    if (description) url.searchParams.set('error_description', description);
    if (state) url.searchParams.set('state', state);
    res.redirect(url.toString());
  };

  // 'code' = authorization code flow (default, recommended). 'token' = implicit
  // flow, supported only for legacy clients like Odoo's stock auth_oauth, which
  // validate the returned token server-side via the userinfo endpoint.
  if (response_type !== 'code' && response_type !== 'token') {
    return fail('unsupported_response_type', 'supported: code, token');
  }

  const scopes = grantScopes(scope, client.allowedScopes);
  if (!scopes.includes('openid')) return fail('invalid_scope', 'openid scope is required');

  // Authenticate the end-user. If there's no IdP session, bounce to the existing
  // frontend login (Google / Bluesky / ...). After login the frontend posts the
  // LinkedTrust token to /oauth/session to set the session cookie, then returns
  // the browser here to continue silently.
  const userId = sessionUserId(req);
  if (!userId) {
    const returnTo = `${process.env.BASE_URL}${req.originalUrl}`;
    // Per-client sign-in page. The client is already resolved here, so callers
    // pass nothing extra — they keep calling /oauth/authorize as before. The
    // page fetches its display details from /oauth/client/:clientId rather than
    // trusting a query string, so the app name shown can't be spoofed.
    const login = new URL(`/sso/${encodeURIComponent(client.clientId)}`, FRONTEND_URL);
    login.searchParams.set('lt_oidc', '1');
    login.searchParams.set('return_to', returnTo);
    res.redirect(login.toString());
    return;
  }

  // Slide the session forward on each use, so an active user stays logged in.
  setSessionCookie(res, userId);

  // Implicit flow: return the access token in the redirect fragment. The client
  // (e.g. Odoo) validates it server-side via /oauth/userinfo.
  if (response_type === 'token') {
    const accessToken = await oidc.signAccessToken({ userId, clientId: client.clientId, scopes });
    const url = new URL(redirect_uri);
    const params = new URLSearchParams({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: '3600',
      scope: scopes.join(' '),
    });
    if (state) params.set('state', state);
    url.hash = params.toString();
    res.redirect(url.toString());
    return;
  }

  const code = crypto.randomBytes(32).toString('base64url');
  await prisma.oidcAuthCode.create({
    data: {
      code,
      clientId: client.clientId,
      userId,
      redirectUri: redirect_uri,
      scope: scopes.join(' '),
      nonce: nonce || null,
      codeChallenge: code_challenge || null,
      codeChallengeMethod: code_challenge_method || null,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  const url = new URL(redirect_uri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  res.redirect(url.toString());
}

// ── /oauth/token ───────────────────────────────────────────────────────────────
export async function token(req: Request, res: Response): Promise<void> {
  const body = req.body || {};
  const grantType = body.grant_type;
  if (grantType !== 'authorization_code') {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }

  // Client authentication: client_secret_basic or client_secret_post.
  let clientId = body.client_id as string | undefined;
  let clientSecret = body.client_secret as string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Basic ')) {
    const [id, secret] = Buffer.from(authHeader.slice(6), 'base64').toString().split(':');
    clientId = clientId || id;
    clientSecret = clientSecret || secret;
  }

  const code = body.code as string | undefined;
  const redirectUri = body.redirect_uri as string | undefined;
  if (!clientId || !code || !redirectUri) {
    res.status(400).json({ error: 'invalid_request', error_description: 'missing client_id, code, or redirect_uri' });
    return;
  }

  const client = await prisma.oidcClient.findUnique({ where: { clientId } });
  if (!client) {
    res.status(401).json({ error: 'invalid_client' });
    return;
  }

  // Confidential clients must present a valid secret; public clients must use PKCE.
  if (!client.isPublic) {
    if (!clientSecret || !(await bcrypt.compare(clientSecret, client.clientSecret))) {
      res.status(401).json({ error: 'invalid_client', error_description: 'bad client credentials' });
      return;
    }
  }

  const authCode = await prisma.oidcAuthCode.findUnique({ where: { code } });
  if (!authCode || authCode.consumedAt || authCode.expiresAt < new Date()) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'code is invalid, expired, or already used' });
    return;
  }
  if (authCode.clientId !== clientId || authCode.redirectUri !== redirectUri) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'code does not match client/redirect_uri' });
    return;
  }
  if (authCode.codeChallenge) {
    if (!oidc.verifyPkce(body.code_verifier || '', authCode.codeChallenge, authCode.codeChallengeMethod)) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
      return;
    }
  } else if (client.isPublic) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE required for public clients' });
    return;
  }

  // One-time use.
  await prisma.oidcAuthCode.update({ where: { code }, data: { consumedAt: new Date() } });

  const scopes = authCode.scope.split(' ').filter(Boolean);
  const user = await prisma.user.findUnique({ where: { id: authCode.userId } });
  if (!user) {
    res.status(400).json({ error: 'invalid_grant', error_description: 'user no longer exists' });
    return;
  }

  const [accessToken, idToken] = await Promise.all([
    oidc.signAccessToken({ userId: user.id, clientId, scopes }),
    oidc.signIdToken({
      userId: user.id,
      clientId,
      scopes,
      nonce: authCode.nonce,
      identity: { email: user.email, name: user.name },
    }),
  ]);

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    id_token: idToken,
    scope: scopes.join(' '),
  });
}

// ── /oauth/userinfo ─────────────────────────────────────────────────────────────
export async function userinfo(req: Request, res: Response): Promise<void> {
  // Accept the token as a Bearer header (OIDC standard) or as an ?access_token=
  // query param (how Odoo's auth_oauth calls the validation endpoint).
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : (req.query.access_token as string | undefined);
  if (!token) {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  let claims: { userId: number; scopes: string[] };
  try {
    claims = await oidc.verifyAccessToken(token);
  } catch {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: claims.userId } });
  if (!user) {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  // `sub` is the OIDC standard subject; `user_id` is the same value under the key
  // Odoo's auth_oauth expects from its validation endpoint.
  const out: Record<string, unknown> = { sub: String(user.id), user_id: String(user.id) };
  if (claims.scopes.includes('email') && user.email) {
    out.email = user.email;
    out.email_verified = true;
  }
  if (claims.scopes.includes('profile') && user.name) out.name = user.name;
  if (claims.scopes.includes('trust')) out.trust = await oidc.resolveTrustSignal(user.id);

  res.json(out);
}

// ── /oauth/session ────────────────────────────────────────────────────────────
// The frontend posts a verified LinkedTrust access token here after the user
// logs in (Google/Bluesky/etc.); we set the IdP session cookie so /oauth/authorize
// can continue silently. This is the bridge between federated login and OIDC.
export async function session(req: Request, res: Response): Promise<void> {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : undefined;
  const ltToken = bearer || (req.body && req.body.access_token);
  if (!ltToken) {
    res.status(400).json({ error: 'missing_token' });
    return;
  }
  try {
    const decoded = jwt.verify(ltToken, ACCESS_SECRET) as any;
    if (decoded.type !== 'access') throw new Error('not an access token');
    setSessionCookie(res, Number(decoded.userId));
    res.status(204).end();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

// ── /oauth/bind-invite ─────────────────────────────────────────────────────────
// Redeems an admin-minted SSO invite (a JWT signed with ACCESS_SECRET, typ
// 'sso_invite', carrying a target email + single-use jti). Invites can ONLY be
// created server-side via scripts/make-sso-invite.ts — there is no route to mint
// one, so possession of a valid invite is itself the admin's authorization.
//
// The user first completes a normal OAuth login (Google/Bluesky/etc.); the
// frontend posts that LinkedTrust access token here together with the invite.
// If an account already owns the invited email, we point the IdP session at THAT
// account (so subsequent /oauth/authorize → userinfo returns the real email and
// the relying app, e.g. Taiga, matches the existing user). If no account owns the
// email, we set it on the account they just logged in with.
export async function bindInvite(req: Request, res: Response): Promise<void> {
  // 1. Authenticate the caller via their LinkedTrust access token.
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : undefined;
  const ltToken = bearer || (req.body && req.body.access_token);
  if (!ltToken) {
    res.status(400).json({ error: 'missing_token' });
    return;
  }
  let authUserId: number;
  try {
    const decoded = jwt.verify(ltToken, ACCESS_SECRET) as any;
    if (decoded.type !== 'access') throw new Error('not an access token');
    authUserId = Number(decoded.userId);
  } catch {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  // 2. Verify the invite.
  const inviteToken: string | undefined =
    (req.body && req.body.invite) || (typeof req.query.invite === 'string' ? req.query.invite : undefined);
  if (!inviteToken) {
    res.status(400).json({ error: 'missing_invite' });
    return;
  }
  if (!INVITE_SECRET) {
    res.status(503).json({ error: 'invites_disabled' });
    return;
  }
  let email: string;
  let jti: string;
  try {
    const inv = jwt.verify(inviteToken, INVITE_SECRET) as any;
    if (inv.typ !== 'sso_invite' || !inv.email || !inv.jti) throw new Error('not an sso invite');
    email = String(inv.email);
    jti = String(inv.jti);
  } catch {
    res.status(401).json({ error: 'invalid_invite' });
    return;
  }

  // 3. Single-use: atomically claim the jti. If it's already there, it was used.
  const claimed = await prisma.$executeRaw`
    INSERT INTO sso_invites (jti, email, consumed_at) VALUES (${jti}, ${email}, CURRENT_TIMESTAMP)
    ON CONFLICT (jti) DO NOTHING`;
  if (claimed === 0) {
    res.status(409).json({ error: 'invite_already_used' });
    return;
  }

  // 4. Resolve the target account (case-insensitive match on the invited email).
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, email: true },
  });
  let targetUserId: number;
  let resolvedEmail: string;
  if (existing) {
    targetUserId = existing.id;
    resolvedEmail = existing.email || email;
  } else {
    await prisma.user.update({ where: { id: authUserId }, data: { email } });
    targetUserId = authUserId;
    resolvedEmail = email;
  }

  // 5. Point the IdP session at the target account and report back.
  setSessionCookie(res, targetUserId);
  res.json({ ok: true, account: targetUserId, email: resolvedEmail });
}
