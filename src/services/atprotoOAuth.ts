/**
 * ATProto OAuth Service
 *
 * Implements Bluesky OAuth login for LinkedTrust.
 * Uses @atproto/oauth-client-node for the OAuth 2.1 + DPoP + PKCE flow.
 *
 * Scopes:
 *   - atproto: identity (DID + handle)
 *   - com.linkedclaims.authFull: write com.linkedclaims.claim records to user's PDS
 *   - transition:email: read email (optional, user can uncheck on PDS consent screen)
 *
 * We do NOT request transition:generic — no access to Bluesky posts.
 *
 * State and session stores are backed by Postgres (atproto_oauth_state, atproto_oauth_session).
 */

import { prisma } from '../lib/prisma';

// Postgres-backed store implementing the SimpleStore interface
// { get(key), set(key, value), del(key) }
function createPgStateStore() {
  return {
    async get(key: string) {
      const row = await prisma.atprotoOAuthState.findUnique({ where: { key } });
      return (row?.value as any) ?? undefined;
    },
    async set(key: string, value: any) {
      await prisma.atprotoOAuthState.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    },
    async del(key: string) {
      await prisma.atprotoOAuthState.deleteMany({ where: { key } });
    },
  };
}

function createPgSessionStore() {
  return {
    async get(key: string) {
      const row = await prisma.atprotoOAuthSession.findUnique({ where: { key } });
      return (row?.value as any) ?? undefined;
    },
    async set(key: string, value: any) {
      await prisma.atprotoOAuthSession.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    },
    async del(key: string) {
      await prisma.atprotoOAuthSession.deleteMany({ where: { key } });
    },
  };
}

let oauthClient: any = null;
let initPromise: Promise<void> | null = null;

function getBaseUrl(): string {
  return process.env.BASE_URL || 'https://dev.linkedtrust.us';
}

function getClientMetadata() {
  const baseUrl = getBaseUrl();
  return {
    client_id: `${baseUrl}/oauth/atproto/client-metadata.json`,
    client_name: 'LinkedTrust',
    client_uri: baseUrl,
    logo_uri: `${baseUrl}/logo.png`,
    redirect_uris: [`${baseUrl}/auth/atproto/callback`] as [string, ...string[]],
    // Superset of scopes this client MAY request (listing ≠ requesting). Login asks
    // for a subset (identity + email); the granular claim-write scope is requested
    // only at claim-create time. We never list/request transition:generic.
    scope: 'atproto transition:email repo:com.linkedclaims.claim?action=create',
    grant_types: ['authorization_code', 'refresh_token'] as ['authorization_code', 'refresh_token'],
    response_types: ['code'] as ['code'],
    token_endpoint_auth_method: 'none' as const,
    application_type: 'web' as const,
    dpop_bound_access_tokens: true,
  };
}

async function ensureClient(): Promise<any> {
  if (oauthClient) return oauthClient;
  if (initPromise) {
    await initPromise;
    return oauthClient;
  }

  initPromise = (async () => {
    try {
      const { NodeOAuthClient } = await import('@atproto/oauth-client-node');

      oauthClient = new NodeOAuthClient({
        clientMetadata: getClientMetadata(),
        stateStore: createPgStateStore(),
        sessionStore: createPgSessionStore(),
      });

      console.log('ATProto OAuth client initialized (Postgres-backed stores)');
    } catch (err) {
      console.error('Failed to initialize ATProto OAuth client:', err);
      initPromise = null;
      throw err;
    }
  })();

  await initPromise;
  return oauthClient;
}

export class AtprotoOAuth {
  /**
   * Get client metadata JSON (served at /oauth/atproto/client-metadata.json)
   * The user's PDS fetches this to validate the OAuth client.
   */
  static getClientMetadata() {
    return getClientMetadata();
  }

  /**
   * Start the OAuth authorization flow.
   * Returns the URL to redirect the user to.
   */
  static async authorize(handle: string, opts?: { skipEmail?: boolean }): Promise<string> {
    const client = await ensureClient();

    // Strip leading @ — users commonly type @handle.bsky.social
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

    // Simple: grant the narrow claim-write scope at login so publishing a LinkedClaim
    // to the user's repo works directly (no mid-claim OAuth step-up). This scope permits
    // ONLY writing com.linkedclaims.claim records — it CANNOT touch their Bluesky posts
    // (that would be transition:generic, which we never request).
    let scope = 'atproto repo:com.linkedclaims.claim?action=create';
    if (!opts?.skipEmail) scope += ' transition:email';

    const url = await client.authorize(cleanHandle, { scope });
    return url.toString();
  }

  /**
   * Handle the OAuth callback from the PDS.
   * Returns the user's DID, handle, and profile info.
   */
  static async handleCallback(params: URLSearchParams): Promise<{
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    email?: string;
    scope: string;
  }> {
    const client = await ensureClient();
    const { session } = await client.callback(params);
    const did = session.did;

    // Resolve profile from Bluesky public API
    const { BskyAgent } = await import('@atproto/api');
    const agent = new BskyAgent({ service: 'https://public.api.bsky.app' });

    let handle = did;
    let displayName: string | undefined;
    let avatar: string | undefined;

    try {
      const profile = await agent.getProfile({ actor: did });
      handle = profile.data.handle;
      displayName = profile.data.displayName;
      avatar = profile.data.avatar;
    } catch (err) {
      console.warn('ATProto OAuth: failed to resolve profile for', did, err);
    }

    // Check what scopes were actually granted
    const tokenInfo = await session.getTokenInfo();
    const grantedScope = tokenInfo.scope || '';
    const grantedScopes = new Set(grantedScope.split(/\s+/).filter(Boolean));

    let email: string | undefined;
    if (grantedScopes.has('transition:email')) {
      try {
        // Pull account email from the authenticated PDS session.
        const sessionData = await (session as any).agent.com.atproto.server.getSession();
        email = sessionData?.data?.email;
      } catch (err) {
        console.warn('ATProto OAuth: failed to fetch email from com.atproto.server.getSession', err);
      }
    }

    return {
      did,
      handle,
      displayName,
      avatar,
      email,
      scope: grantedScope,
    };
  }

  /**
   * Get a stored OAuth session for a DID (for publishing on behalf of user).
   * Sessions survive backend restarts because they're in Postgres.
   */
  static async getSession(did: string): Promise<any> {
    const client = await ensureClient();
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await client.restore(did);
      } catch (err: any) {
        const isLastAttempt = attempt === MAX_RETRIES;
        const isTransient =
          err?.code === 'ECONNRESET' ||
          err?.code === 'ETIMEDOUT' ||
          err?.code === 'ENOTFOUND' ||
          err?.code === 'EAI_AGAIN' ||
          err?.message?.includes('fetch failed') ||
          (err?.status && err.status >= 500);

        if (isTransient && !isLastAttempt) {
          const delay = 500 * (attempt + 1);
          console.warn(
            `ATProto OAuth: transient error restoring session for ${did} (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms:`,
            err?.message || err
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        // Non-transient or final attempt — log and return null
        console.error(
          `ATProto OAuth: failed to restore session for ${did}${isTransient ? ` after ${MAX_RETRIES + 1} attempts` : ''}:`,
          err
        );
        return null;
      }
    }

    return null;
  }
}
