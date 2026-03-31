/**
 * ATProto Publisher Service
 *
 * Publishes claims to the AT Protocol (Bluesky) as com.linkedclaims.claim records.
 * Uses the server's Bluesky account (app password) to publish on behalf of the system.
 *
 * Design:
 * - Fire-and-forget: failures never block claim creation
 * - All exceptions caught and logged
 * - Lazy initialization: connects on first publish attempt
 * - claimUri: if the claim already has a claimAddress, that becomes the claimUri.
 *   If not, claimUri is generated from BASE_URL + claim ID.
 *   ATProto-native claims (future) would use their at:// URI as claimUri.
 *
 * Env vars (not required — if missing, publishing is silently disabled):
 *   ATPROTO_HANDLE    — Bluesky handle (e.g., claims.linkedtrust.us or claims.bsky.social)
 *   ATPROTO_APP_PASSWORD — App password (not the main account password)
 *   ATPROTO_SERVICE   — PDS URL (default: https://bsky.social)
 */

import { PrismaClient } from '@prisma/client';
import { AtprotoOAuth } from './atprotoOAuth';

const prisma = new PrismaClient();
const COLLECTION = 'com.linkedclaims.claim';

// Agent and session state — lazily initialized
let agent: any = null;
let loginPromise: Promise<boolean> | null = null;
let enabled: boolean | null = null;

function isEnabled(): boolean {
  if (enabled !== null) return enabled;
  enabled = !!(process.env.ATPROTO_HANDLE && process.env.ATPROTO_APP_PASSWORD);
  if (!enabled) {
    console.log('ATProto publisher disabled: ATPROTO_HANDLE and ATPROTO_APP_PASSWORD not set');
  }
  return enabled;
}

async function ensureAgent(): Promise<any> {
  if (agent?.session) return agent;

  // Prevent concurrent login attempts
  if (loginPromise) return loginPromise.then(() => agent);

  loginPromise = (async () => {
    try {
      // @atproto/api is ESM — dynamic import for CJS compatibility
      const { AtpAgent } = await import('@atproto/api');

      const service = process.env.ATPROTO_SERVICE || 'https://bsky.social';
      agent = new AtpAgent({ service });

      await agent.login({
        identifier: process.env.ATPROTO_HANDLE!,
        password: process.env.ATPROTO_APP_PASSWORD!,
      });

      console.log(`ATProto publisher logged in as ${process.env.ATPROTO_HANDLE} on ${service}`);
      return true;
    } catch (error) {
      console.error('ATProto publisher login failed:', error);
      agent = null;
      return false;
    } finally {
      loginPromise = null;
    }
  })();

  await loginPromise;
  return agent;
}

function buildClaimUri(claim: any): string {
  // If claim already has a claimAddress, use it
  if (claim.claimAddress) return claim.claimAddress;

  // Generate from BASE_URL + claim ID
  const baseUrl = process.env.BASE_URL || 'https://live.linkedtrust.us';
  return `${baseUrl}/api/claim/${claim.id}`;
}

function buildRespondAt(claim: any): string {
  if (claim.respondAt) return claim.respondAt;
  const baseUrl = process.env.BASE_URL || 'https://live.linkedtrust.us';
  return `${baseUrl}/api/claim/${claim.id}/validate`;
}

/**
 * Map a DB claim to a com.linkedclaims.claim ATProto record.
 */
function mapClaimToRecord(claim: any): Record<string, any> {
  const record: Record<string, any> = {
    $type: COLLECTION,
    claimUri: buildClaimUri(claim),
    subject: claim.subject,
    claimType: claim.claim,
    createdAt: claim.createdAt instanceof Date ? claim.createdAt.toISOString() : claim.createdAt,
  };

  if (claim.object) record.object = claim.object;
  if (claim.statement) record.statement = claim.statement;
  if (claim.confidence !== null && claim.confidence !== undefined) record.confidence = claim.confidence;
  if (claim.stars !== null && claim.stars !== undefined) record.stars = claim.stars;
  if (claim.aspect) record.aspect = claim.aspect;
  if (claim.respondAt || claim.id) record.respondAt = buildRespondAt(claim);

  if (claim.effectiveDate) {
    record.effectiveDate = claim.effectiveDate instanceof Date
      ? claim.effectiveDate.toISOString()
      : claim.effectiveDate;
  }

  // Build source object if any source fields present
  const source: Record<string, any> = {};
  if (claim.sourceURI) source.uri = claim.sourceURI;
  if (claim.howKnown) source.howKnown = claim.howKnown;
  if (claim.digestMultibase) source.digestMultibase = claim.digestMultibase;
  if (claim.dateObserved) {
    source.dateObserved = claim.dateObserved instanceof Date
      ? claim.dateObserved.toISOString()
      : claim.dateObserved;
  }
  if (claim.author) source.author = claim.author;
  if (claim.curator) source.curator = claim.curator;
  if (Object.keys(source).length > 0) record.source = source;

  // Build embeddedProof if claim has a JSON proof from external signer
  if (claim.proof && claim.issuerId && claim.issuerIdType !== 'URL') {
    try {
      const proofData = typeof claim.proof === 'string' ? JSON.parse(claim.proof) : claim.proof;
      if (proofData.type && proofData.proofValue) {
        record.embeddedProof = {
          type: proofData.type,
          verificationMethod: proofData.verificationMethod || claim.issuerId,
          proofValue: proofData.proofValue,
          proofPurpose: proofData.proofPurpose || 'assertionMethod',
          created: proofData.created || record.createdAt,
        };
      }
    } catch {
      // proof is not parseable JSON — skip embeddedProof
    }
  }

  return record;
}

export class AtprotoPublisher {
  /**
   * Publish a claim to ATProto. Fire-and-forget — never throws.
   *
   * If userDid is provided and the user has an OAuth session with
   * com.linkedclaims.authFull scope, publishes to the USER's repo
   * (signed by them). Otherwise falls back to the server's app password.
   */
  static async publishClaim(claim: any, userDid?: string): Promise<void> {
    try {
      // Don't re-publish claims that came FROM ATProto (indexed via Jetstream)
      if (claim.claimAddress && claim.claimAddress.startsWith('at://')) {
        return;
      }

      const record = mapClaimToRecord(claim);
      let result: any;

      // Try user's OAuth session first
      if (userDid) {
        const userSession = await AtprotoOAuth.getSession(userDid);
        if (userSession) {
          // Check if session has a scope that grants repo write access.
          // We accept either com.linkedclaims.authFull (our custom scope, for when
          // Bluesky supports minimal scopes) or the standard 'atproto' scope.
          const tokenInfo = await userSession.getTokenInfo();
          const scope = tokenInfo.scope || '';
          if (scope.includes('com.linkedclaims.authFull') || scope.includes('atproto')) {
            const { Agent } = await import('@atproto/api');
            const userAgent = new Agent(userSession);

            result = await userAgent.com.atproto.repo.createRecord({
              repo: userDid,
              collection: COLLECTION,
              record,
            });

            console.log(`ATProto published claim ${claim.id} to USER repo ${userDid} → ${result.data.uri}`);
          } else {
            console.log(`ATProto: user ${userDid} session lacks authFull or atproto scope (has: ${scope}), falling back to server`);
          }
        } else {
          console.log(`ATProto: no OAuth session for ${userDid}, falling back to server`);
        }
      }

      // Fall back to server's app password if user publish didn't happen
      if (!result) {
        if (!isEnabled()) return;

        const atpAgent = await ensureAgent();
        if (!atpAgent?.session) {
          console.error('ATProto publisher: not authenticated, skipping claim', claim.id);
          return;
        }

        result = await atpAgent.com.atproto.repo.createRecord({
          repo: atpAgent.session.did,
          collection: COLLECTION,
          record,
        });

        console.log(`ATProto published claim ${claim.id} to SERVER repo → ${result.data.uri}`);
      }

      // Store AT-URI on the claim so the indexer knows not to re-import it
      try {
        await prisma.claim.update({
          where: { id: claim.id },
          data: { claimAddress: result.data.uri }
        });
      } catch (updateErr) {
        console.error(`ATProto: published but failed to store AT-URI on claim ${claim.id}:`, updateErr);
      }
    } catch (error) {
      console.error(`ATProto publish failed for claim ${claim.id}:`, error);
      // Never throw — ATProto failures must not break claim creation
    }
  }
}
