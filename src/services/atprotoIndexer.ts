/**
 * ATProto Jetstream Indexer
 *
 * Connects to Jetstream (ATProto's simplified firehose) and indexes
 * com.linkedclaims.claim records from ALL publishers into our Claim table.
 *
 * Architecture: This makes trust_claim_backend an AppView for LinkedClaims.
 * We subscribe to the firehose filtered by our collection, and store
 * incoming records using the same Claim model the rest of the app uses.
 *
 * No schema changes. No migrations. Fully backwards compatible.
 *
 * Env vars:
 *   ATPROTO_INDEX_ENABLED  — set to "true" to enable (default: disabled)
 *   ATPROTO_INDEX_REPOS    — comma-separated DIDs to also backfill on startup (optional)
 *   ATPROTO_JETSTREAM_URL  — Jetstream endpoint (default: wss://jetstream2.us-west.bsky.network/subscribe)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COLLECTION = 'com.linkedclaims.claim';
const ATPROTO_PUBLIC_API = 'https://public.api.bsky.app';

const DEFAULT_JETSTREAM = 'wss://jetstream2.us-west.bsky.network/subscribe';

let ws: any = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let enabled: boolean | null = null;

// ── Config ────────────────────────────────────────────────

function isEnabled(): boolean {
  if (enabled !== null) return enabled;
  enabled = process.env.ATPROTO_INDEX_ENABLED === 'true';
  if (!enabled) {
    console.log('ATProto indexer disabled: set ATPROTO_INDEX_ENABLED=true to enable');
  }
  return enabled;
}

// ── Claim Mapping ─────────────────────────────────────────

interface JetstreamEvent {
  did: string;
  time_us?: number;
  kind: 'commit' | 'identity' | 'account';
  commit?: {
    rev: string;
    operation: 'create' | 'update' | 'delete';
    collection: string;
    rkey: string;
    record?: any;
    cid?: string;
  };
}

function mapHowKnown(val?: string): string | null {
  if (!val) return null;
  const valid = [
    'FIRST_HAND', 'SECOND_HAND', 'WEB_DOCUMENT', 'VERIFIED_LOGIN',
    'SIGNED_DOCUMENT', 'BLOCKCHAIN', 'RESEARCH', 'OPINION', 'OTHER'
  ];
  return valid.includes(val) ? val : null;
}

async function importRecord(did: string, rkey: string, cid: string, record: any): Promise<void> {
  const atUri = `at://${did}/${COLLECTION}/${rkey}`;

  // Check if we already have this claim (by claimAddress)
  const existing = await prisma.claim.findFirst({
    where: { claimAddress: atUri }
  });
  if (existing) return; // Already indexed

  // Map ATProto record to Claim data
  const claimData: any = {
    subject: record.subject,
    claim: record.claimType || 'claim',
    object: record.object || null,
    statement: record.statement || null,
    sourceURI: record.source?.uri || null,
    howKnown: mapHowKnown(record.source?.howKnown),
    digestMultibase: record.source?.digestMultibase || null,
    dateObserved: record.source?.dateObserved ? new Date(record.source.dateObserved) : null,
    author: record.source?.author || null,
    curator: record.source?.curator || null,
    confidence: record.confidence != null ? Number(record.confidence) : null,
    stars: record.stars != null ? Number(record.stars) : null,
    aspect: record.aspect || null,
    respondAt: record.respondAt || null,
    effectiveDate: record.effectiveDate ? new Date(record.effectiveDate) : new Date(),
    claimAddress: atUri,
    proof: cid, // CID for verification
    issuerId: did,
    issuerIdType: 'DID',
    createdAt: record.createdAt ? new Date(record.createdAt) : new Date(),
  };

  const newClaim = await prisma.claim.create({ data: claimData });
  console.log(`ATProto indexed: ${atUri} → claim ${newClaim.id}`);

  // Import evidence items as Image rows
  if (record.evidence && Array.isArray(record.evidence)) {
    for (const item of record.evidence) {
      if (!item.uri) continue;
      try {
        const isVideo = item.mediaType?.startsWith('video/') ||
          /\.(mp4|webm|mov|ogg)(\?|$)/i.test(item.uri);

        await prisma.image.create({
          data: {
            claimId: newClaim.id,
            url: item.uri,
            digestMultibase: item.digestMultibase || null,
            metadata: {
              ...(isVideo ? { type: 'video' } : {}),
              ...(item.mediaType ? { contentType: item.mediaType } : {}),
              ...(item.description ? { description: item.description } : {}),
            },
            effectiveDate: newClaim.effectiveDate ?? new Date(),
            owner: did,
            signature: cid, // CID as provenance
          }
        });
      } catch (err) {
        console.error(`ATProto indexer: failed to import evidence for claim ${newClaim.id}:`, err);
      }
    }
  }
}

// ── Jetstream Connection ──────────────────────────────────

function connect(): void {
  if (!isEnabled()) return;

  // Dynamic import for WebSocket (Node doesn't have native WS in all versions)
  let WebSocket: any;
  try {
    WebSocket = require('ws');
  } catch {
    console.error('ATProto indexer: ws package not installed. Run: npm install ws');
    return;
  }

  const url = (process.env.ATPROTO_JETSTREAM_URL || DEFAULT_JETSTREAM) +
    '?wantedCollections=' + encodeURIComponent(COLLECTION);

  console.log(`ATProto indexer: connecting to ${url}`);

  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('ATProto indexer: connected to Jetstream');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  ws.on('message', async (data: Buffer) => {
    try {
      const event: JetstreamEvent = JSON.parse(data.toString());

      if (event.kind !== 'commit') return;
      if (!event.commit) return;
      if (event.commit.collection !== COLLECTION) return;

      if (event.commit.operation === 'create' || event.commit.operation === 'update') {
        if (!event.commit.record) return;
        if (!event.commit.record.subject) return; // Invalid claim, skip

        await importRecord(
          event.did,
          event.commit.rkey,
          event.commit.cid || '',
          event.commit.record
        );
      }
      // We don't handle deletes for now — claims are meant to be immutable
    } catch (err) {
      console.error('ATProto indexer: error processing event:', err);
    }
  });

  ws.on('close', () => {
    console.log('ATProto indexer: disconnected, reconnecting in 5s...');
    ws = null;
    reconnectTimer = setTimeout(connect, 5000);
  });

  ws.on('error', (err: Error) => {
    console.error('ATProto indexer: WebSocket error:', err.message);
    // close handler will trigger reconnect
  });
}

// ── Backfill from known repos ─────────────────────────────

async function backfillRepo(repo: string): Promise<number> {
  let imported = 0;
  let cursor: string | undefined;

  console.log(`ATProto indexer: backfilling ${repo}...`);

  while (true) {
    let url = `${ATPROTO_PUBLIC_API}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(repo)}&collection=${COLLECTION}&limit=100`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

    const res = await fetch(url);
    if (!res.ok) {
      console.error(`ATProto indexer: backfill error for ${repo}: HTTP ${res.status}`);
      break;
    }

    const data: any = await res.json();
    const records = data.records || [];

    for (const r of records) {
      if (!r.value?.subject) continue;
      try {
        await importRecord(repo, r.uri.split('/').pop(), r.cid || '', r.value);
        imported++;
      } catch (err) {
        console.error(`ATProto indexer: backfill import error:`, err);
      }
    }

    if (!data.cursor || records.length === 0) break;
    cursor = data.cursor;
  }

  console.log(`ATProto indexer: backfilled ${imported} claims from ${repo}`);
  return imported;
}

// ── Public API ────────────────────────────────────────────

export class AtprotoIndexer {
  /**
   * Start the indexer. Call once on server startup.
   * Connects to Jetstream and optionally backfills known repos.
   */
  static start(): void {
    if (!isEnabled()) return;

    // Connect to Jetstream for live events
    connect();

    // Backfill known repos if configured
    const repos = process.env.ATPROTO_INDEX_REPOS;
    if (repos) {
      const repoList = repos.split(',').map(r => r.trim()).filter(Boolean);
      // Run backfill in background, don't block startup
      (async () => {
        for (const repo of repoList) {
          try {
            await backfillRepo(repo);
          } catch (err) {
            console.error(`ATProto indexer: backfill failed for ${repo}:`, err);
          }
        }
      })();
    }
  }

  /**
   * Backfill a specific repo on demand (e.g. from an API call).
   */
  static async backfill(repo: string): Promise<number> {
    return backfillRepo(repo);
  }

  /**
   * Stop the indexer.
   */
  static stop(): void {
    if (ws) {
      ws.close();
      ws = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }
}
