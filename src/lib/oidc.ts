// OIDC provider primitives for "Sign in with LinkedTrust".
//
// LinkedTrust positions as a *trust* provider, not just a login provider: the
// id_token / userinfo response carries identity AND a trust signal (the `trust`
// scope, on by default). Identity is federated in via the existing login
// methods (Google / Bluesky / etc.); the trust signal is computed from the
// Claim graph. See ~/work/5-27-2026-auth-service-idea.md.
//
// id_tokens and access tokens are signed with the server's existing Ed25519 key
// (EdDSA). A second RS256 key can be added to the JWKS later for client libs
// that don't support EdDSA — no code change for clients beyond key selection.

import * as jose from 'jose';

const ISSUER = process.env.BASE_URL || 'https://dev.linkedtrust.us';
const KEY_ID = 'server-key-1';
const ALG = 'EdDSA';

export const SUPPORTED_SCOPES = ['openid', 'profile', 'email', 'trust'];
export const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'trust'];

// dotenv expands \n in double-quoted values to real newlines; this replace is a
// defensive no-op in that case and a fix if the PEM arrives escaped.
function pem(envVar: string): string {
  return (process.env[envVar] || '').replace(/\\n/g, '\n');
}

let _privateKey: Promise<jose.KeyLike> | null = null;
let _publicJwk: Promise<jose.JWK> | null = null;

function privateKey(): Promise<jose.KeyLike> {
  if (!_privateKey) _privateKey = jose.importPKCS8(pem('SERVER_PRIVATE_KEY'), ALG);
  return _privateKey;
}

async function publicJwk(): Promise<jose.JWK> {
  if (!_publicJwk) {
    _publicJwk = (async () => {
      const key = await jose.importSPKI(pem('SERVER_PUBLIC_KEY'), ALG);
      const jwk = await jose.exportJWK(key);
      return { ...jwk, use: 'sig', alg: ALG, kid: KEY_ID };
    })();
  }
  return _publicJwk;
}

export async function jwks(): Promise<{ keys: jose.JWK[] }> {
  return { keys: [await publicJwk()] };
}

export function discoveryDocument() {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth/authorize`,
    token_endpoint: `${ISSUER}/oauth/token`,
    userinfo_endpoint: `${ISSUER}/oauth/userinfo`,
    jwks_uri: `${ISSUER}/.well-known/jwks.json`,
    response_types_supported: ['code', 'token'],
    grant_types_supported: ['authorization_code', 'implicit'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: [ALG],
    scopes_supported: SUPPORTED_SCOPES,
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    code_challenge_methods_supported: ['S256'],
    claims_supported: ['sub', 'email', 'email_verified', 'name', 'trust'],
  };
}

export interface IdentityClaims {
  email?: string | null;
  name?: string | null;
}

export interface TrustSignal {
  status: 'stub' | 'resolved';
  level: number | null;
  vouches: unknown[];
  note?: string;
}

// STUB. The real implementation will resolve vouches / roots-of-trust from the
// Claim graph (subject / claim / object / issuerId / confidence / score) and may
// read private/encrypted claims. Returns an explicit placeholder so clients can
// integrate the `trust` claim shape now without us shipping fake data.
export async function resolveTrustSignal(_userId: number): Promise<TrustSignal> {
  return {
    status: 'stub',
    level: null,
    vouches: [],
    note: 'trust resolution not yet implemented (see auth-service-idea.md)',
  };
}

const ISSUED_BY_CLAIM = 'lt';

export async function signIdToken(opts: {
  userId: number;
  clientId: string;
  scopes: string[];
  nonce?: string | null;
  identity: IdentityClaims;
}): Promise<string> {
  const { userId, clientId, scopes, nonce, identity } = opts;
  const payload: Record<string, unknown> = {};

  if (scopes.includes('email') && identity.email) {
    payload.email = identity.email;
    payload.email_verified = true;
  }
  if (scopes.includes('profile') && identity.name) {
    payload.name = identity.name;
  }
  if (scopes.includes('trust')) {
    payload.trust = await resolveTrustSignal(userId);
  }
  if (nonce) payload.nonce = nonce;

  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: ALG, kid: KEY_ID, typ: 'JWT' })
    .setIssuer(ISSUER)
    .setSubject(String(userId))
    .setAudience(clientId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(await privateKey());
}

export async function signAccessToken(opts: {
  userId: number;
  clientId: string;
  scopes: string[];
}): Promise<string> {
  return new jose.SignJWT({ scope: opts.scopes.join(' '), client_id: opts.clientId, [ISSUED_BY_CLAIM]: 'oidc-access' })
    .setProtectedHeader({ alg: ALG, kid: KEY_ID, typ: 'at+jwt' })
    .setIssuer(ISSUER)
    .setSubject(String(opts.userId))
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(await privateKey());
}

export async function verifyAccessToken(token: string): Promise<{ userId: number; scopes: string[] }> {
  const { payload } = await jose.jwtVerify(token, await jose.importSPKI(pem('SERVER_PUBLIC_KEY'), ALG), {
    issuer: ISSUER,
  });
  if (payload[ISSUED_BY_CLAIM] !== 'oidc-access') throw new Error('not an OIDC access token');
  return {
    userId: Number(payload.sub),
    scopes: String(payload.scope || '').split(' ').filter(Boolean),
  };
}

// PKCE S256 verification.
export function verifyPkce(codeVerifier: string, challenge: string, method?: string | null): boolean {
  if (!challenge) return true; // no PKCE was requested
  if (method && method !== 'S256') return false;
  const hash = jose.base64url.encode(
    new Uint8Array(require('crypto').createHash('sha256').update(codeVerifier).digest()),
  );
  return hash === challenge;
}
