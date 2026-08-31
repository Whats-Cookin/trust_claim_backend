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
import crypto from 'crypto';
import { prisma } from './prisma';
import { prepareForSigning } from './sign-linked-claim';

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

export interface TrustRole {
  app: string;
  role: string | null;
}

export interface TrustSignal {
  status: 'stub' | 'resolved';
  level: number | null;
  vouches: unknown[];
  // Graded trust, derived ONLY from root-anchored, signature-verified claims.
  // Consumers pick their own threshold: hard gate (require a grant/role), soft
  // gate (admit on any signal), or algorithmic (use `level` as a score).
  isRoot?: boolean;
  roots?: string[]; // orgs this subject is a verified trust-root for
  roles?: TrustRole[]; // app-scoped access grants from a verified root
  evidence?: number[]; // claim ids backing the above
  note?: string;
}

const rootDid = () => process.env.LT_ROOT_DID || '';
const rootPubPem = () => (process.env.LT_ROOT_PUBLIC_KEY || '').replace(/\\n/g, '\n');

// A claim only counts if its PROOF verifies against the configured server root
// key (the anchor). The `issuerId` string is never trusted on its own — anyone
// can write one. Custodial: today every trust claim is signed by the root key;
// when orgs get their own keys this extends to "signer chains to the anchor".
function verifiedByRoot(claim: {
  subject: string;
  claim: string;
  object: string | null;
  aspect: string | null;
  statement: string | null;
  howKnown: string | null;
  confidence: number | null;
  effectiveDate: Date | null;
  proof: string | null;
}): boolean {
  if (!claim.proof) return false;
  let proof: any;
  try {
    proof = JSON.parse(claim.proof);
  } catch {
    return false;
  }
  if (!proof.proofValue || proof.verificationMethod !== rootDid()) return false;
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
  try {
    const message = prepareForSigning(linkedClaim as any, proofMeta);
    return crypto.verify(null, Buffer.from(message), rootPubPem(), Buffer.from(proof.proofValue, 'base64'));
  } catch {
    return false;
  }
}

// Map an OIDC user to their claim-graph subject DID. Bluesky/wallet users carry
// a real DID in authProviderId; OAuth-only users have none yet (→ no signal).
async function subjectDids(userId: number): Promise<string[]> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const id = user?.authProviderId || '';
  return id.startsWith('did:') ? [id] : [];
}

// Resolve the user's trust standing from root-anchored capability/grant claims.
export async function resolveTrustSignal(userId: number): Promise<TrustSignal> {
  // No anchor configured → we can verify nothing; stay explicit rather than fake.
  if (!rootDid() || !rootPubPem()) {
    return { status: 'stub', level: null, vouches: [], note: 'no trust root configured' };
  }
  const dids = await subjectDids(userId);
  if (!dids.length) {
    return { status: 'resolved', level: 0, vouches: [], isRoot: false, roots: [], roles: [], evidence: [], note: 'no DID identity' };
  }

  const claims = await prisma.claim.findMany({
    where: { subject: { in: dids }, claim: { in: ['HAS_CAPABILITY', 'HAS_ACCESS'] }, proof: { not: null } },
  });

  const roots: string[] = [];
  const roles: TrustRole[] = [];
  const evidence: number[] = [];
  for (const c of claims) {
    if (!verifiedByRoot(c)) continue; // unsigned / forged / not-by-root → ignored
    evidence.push(c.id);
    if (c.claim === 'HAS_CAPABILITY' && c.aspect === 'trust-root' && c.object) {
      roots.push(c.object);
    } else if (c.claim === 'HAS_ACCESS' && c.object) {
      roles.push({ app: c.object, role: c.statement || c.aspect || null });
    }
  }

  const isRoot = roots.length > 0;
  const level = isRoot ? 100 : roles.length ? 50 : 0;
  return { status: 'resolved', level, vouches: [], isRoot, roots, roles, evidence };
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

// ── redirect_uri matching ────────────────────────────────────────────────────
// Registered redirect URIs match exactly, except that an entry may carry a
// single `*` inside the leftmost host label — e.g.
//   https://crm-*.workers.vc/auth_oauth/signin
// — so one client covers a whole family of per-tenant subdomains without a
// re-registration for each new tenant.
//
// The wildcard is deliberately narrow: it never matches a dot, so it cannot
// expand across domain levels; it is only allowed in the first host label; that
// label must still contain a literal part (so a bare `*.workers.vc` opening the
// whole domain is rejected); the rest of the host must be at least two labels
// (no `*.vc`); and scheme, port, path and query must match exactly.
function hostPatternToRegExp(hostPattern: string): RegExp | null {
  const labels = hostPattern.split('.');
  if (labels.length < 3) return null; // need wildcard label + at least domain.tld
  const [first, ...rest] = labels;
  if (rest.some((l) => l.includes('*'))) return null; // wildcard only in the first label
  const literal = first.replace(/\*/g, '');
  if (!first.includes('*') || literal.length === 0) return null;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const firstRe = first.split('*').map(escape).join('[^.]*');
  return new RegExp(`^${firstRe}\\.${rest.map(escape).join('\\.')}$`);
}

export function redirectUriMatches(pattern: string, uri: string): boolean {
  if (pattern === uri) return true;
  if (!pattern.includes('*')) return false;

  const split = (s: string) => {
    const m = /^(https?:\/\/)([^/?#]+)([^#]*)$/i.exec(s);
    return m ? { scheme: m[1].toLowerCase(), host: m[2].toLowerCase(), rest: m[3] } : null;
  };
  const p = split(pattern);
  const u = split(uri);
  if (!p || !u) return false;
  if (p.scheme !== u.scheme || p.rest !== u.rest) return false;

  const re = hostPatternToRegExp(p.host);
  return re ? re.test(u.host) : false;
}

export function isRegisteredRedirectUri(registered: string[], uri: string): boolean {
  return registered.some((pattern) => redirectUriMatches(pattern, uri));
}
