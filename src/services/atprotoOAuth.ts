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
    scope: 'atproto com.linkedclaims.authFull transition:email',
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
   * Try to restore an existing OAuth session for a handle.
   * Looks up the user's DID in our database and attempts to restore the session.
   * Returns profile info if a valid session exists, null otherwise.
   */
  static async tryRestore(handle: string): Promise<{
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    scope: string;
  } | null> {
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

    // Look up DID from our user table — avoids a network call if we've seen this handle before
    const user = await prisma.user.findFirst({
      where: {
        email: `${cleanHandle}@atproto.local`,
        authType: 'OAUTH',
      },
    });

    const did = user?.authProviderId;
    if (!did) return null;

    const session = await AtprotoOAuth.getSession(did);
    if (!session) return null;

    // Session is valid — resolve profile for fresh info
    const { BskyAgent } = await import('@atproto/api');
    const agent = new BskyAgent({ service: 'https://public.api.bsky.app' });

    let resolvedHandle = cleanHandle;
    let displayName: string | undefined;
    let avatar: string | undefined;

    try {
      const profile = await agent.getProfile({ actor: did });
      resolvedHandle = profile.data.handle;
      displayName = profile.data.displayName;
      avatar = profile.data.avatar;
    } catch (err) {
      console.warn('ATProto OAuth: failed to resolve profile for', did, err);
    }

    const tokenInfo = await session.getTokenInfo();
    const grantedScope = tokenInfo.scope || '';

    return { did, handle: resolvedHandle, displayName, avatar, scope: grantedScope };
  }

  /**
   * Start the OAuth authorization flow.
   * Returns the URL to redirect the user to.
   */
  static async authorize(handle: string, skipEmail?: boolean): Promise<string> {
    const client = await ensureClient();

    // Strip leading @ — users commonly type @handle.bsky.social
    const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

    // Build scope — always include atproto + our lexicon, optionally email
    let scope = 'atproto com.linkedclaims.authFull';
    if (!skipEmail) {
      scope += ' transition:email';
    }

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

    return {
      did,
      handle,
      displayName,
      avatar,
      email: undefined, // email comes from a separate API call if scope was granted
      scope: grantedScope,
    };
  }

  /**
   * Get a stored OAuth session for a DID (for publishing on behalf of user).
   * Sessions survive backend restarts because they're in Postgres.
   */
  static async getSession(did: string): Promise<any> {
    const client = await ensureClient();
    try {
      return await client.restore(did);
    } catch {
      return null;
    }
  }
}
