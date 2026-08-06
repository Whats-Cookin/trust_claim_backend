# Claude Code Notes

## CRITICAL: How to Restart the Backend

**This server uses PM2 (not systemctl).**

```bash
npm run build
pm2 restart trust-claim-backend --update-env
```

- `--update-env` is required when `.env` has changed
- Build outputs to `build/` — PM2 runs from `build/index.js`
- If build files are owned by another user: `sudo chown -R ubuntu:ubuntu build/`

## CRITICAL: Production Server Safety

**This is a LIVE PRODUCTION SERVER (live.linkedtrust.us). DO NOT:**

- **NEVER delete directories like `build/`, `dist/`, `node_modules/`** - These contain running production code
- **NEVER run `rm -rf` on any directory** without explicit user approval
- **NEVER run `pm2 delete`, `pm2 kill`, or restart PM2 directly** - Follow README instructions exactly
- **NEVER update PM2 globally** - It breaks the systemd service configuration
- **NEVER assume a directory is "stale"** - If it exists, it's probably needed

**When making changes:**
1. Read the README deployment instructions completely
2. Only run `npm run build` - PM2 watches for changes automatically
3. If something breaks, DO NOT make random fixes - ask the user first

## IMPORTANT: tsconfig.json outDir

**tsconfig.json `outDir` is set to `"build"` - DO NOT change to `"dist"`**

- Production PM2 runs from `build/index.js`
- The ecosystem.config.js references `dist/` but that's outdated
- Changing outDir to dist will break production deployment
- If dev server uses ecosystem.config.js, update it to use `build/` instead of `dist/`

## Deployment (DEV Server)

**Dev runs on VM 200 (dev.linkedtrust.us).** systemd services: `tmp-trustclaim-dev-backend`, `tmp-trustclaim-dev-frontend`.

- Build locally: `npm run build`
- Reload: `sudo systemctl restart tmp-trustclaim-dev-backend`
- `.env` is in the repo root (not committed)

## Video Storage

Uses generic `LT_STORAGE_*` env vars for S3-compatible storage:
- `LT_STORAGE_ENDPOINT`
- `LT_STORAGE_KEY`
- `LT_STORAGE_SECRET`
- `LT_STORAGE_BUCKET`
- `LT_STORAGE_REGION`
- `LT_STORAGE_CDN_URL`

## CRITICAL: LinkedClaims Architecture Principles

**Reference: https://identity.foundation/labs-linkedclaims/**

### URIs Are The Identity
- A claim's subject is a URI. It can be ANYTHING on the web
- `https://linkedin.com/in/someone` and `https://live.linkedtrust.us/claims/123` are both just URIs
- We make claims ABOUT things, we don't own them

### Decentralized By Design
- LinkedTrust is NOT the center of the universe
- Claims can reference things anywhere on the internet
- This is what makes the system useful - it's a web of trust across the entire web

### The Graph Is The Web
- Nodes represent URIs (any URI, not just ours)
- Edges represent claims about relationships between URIs
- That's it. Simple. Decentralized. Powerful.

### NEVER DO
- **Hardcode URI patterns** - Don't write code that assumes `linkedtrust.us` URIs
- **Special-case "our" URIs** - Internal and external claims are identical
- **Match by ID instead of URI** - URIs are the identity, not database IDs
- **Create workarounds for URI inconsistency** - Fix the source of inconsistency instead

### If URIs Don't Match
The pipeline and claim creation must use CONSISTENT URIs. If dev uses `dev.linkedtrust.us` and pipeline uses `live.linkedtrust.us`, that's a **configuration bug** to fix at the source, not a **code workaround** to add.

## ATProto Integration

LinkedTrust backend is an **AppView** for `com.linkedclaims.claim` — it indexes claims from ATProto alongside claims created through our API.

## CRITICAL: Database is REMOTE (do not get confused)

- **The production DB is REMOTE at `10.0.0.100:5432`** (db `claim`, user `trust_node`, password in `DATABASE_URL` in `.env`). This app server (`trustclaims-prod`, IP `10.0.0.158`) connects to it **over the network**.
- **There is ALSO a local postgres on this VM — it is STALE / NOT the app DB.** It does not have recent claims. **Do NOT query, migrate, or "fix" the local postgres.** Always use `psql -h 10.0.0.100 -U trust_node -d claim`.
- **`trust_node` is NOT the table owner** (owner is `postgres`). It has CRUD but **cannot run DDL** (CREATE/DROP INDEX, ALTER TABLE). Schema/index migrations require the `postgres` owner credentials **on 10.0.0.100**, which are **not on this box** — ask Golda / whoever operates the DB host. Do not thrash searching for them.
- **Do NOT run huge recursive `grep -r`/`find` over `/data`** — it times out (large trees, node_modules, backups).

## Images/media storage — should be B2, NOT inline

- Media should go to **Backblaze B2** via the `LT_STORAGE_*` S3 client (see `src/api/video/upload.ts`), storing the bucket/CDN URL in `Image.url`.
- **BUG (being fixed):** `createClaim` in `src/api/claims.ts` stores base64 images **INLINE** as `data:...;base64,...` in `Image.url` (has a `// TODO: implement proper image storage`). Since ~2026-07-07 ~92% of new images are inline, bloating the DB. Fix = upload to B2 like videos; old inline rows still render via `/api/images/:id`.

### Key Files
- `src/services/atprotoPublisher.ts` — publishes claims TO ATProto (fire-and-forget, uses app password)
- `src/services/atprotoIndexer.ts` — subscribes to Jetstream firehose, indexes claims FROM ATProto
- `src/api/atproto.ts` — endpoints: `GET /api/atproto/claims?subject=URL`, `GET /api/atproto/check`, `POST /api/atproto/backfill`

### Env Vars
```
ATPROTO_HANDLE=linkedclaims.com        # Bluesky handle for publishing
ATPROTO_APP_PASSWORD=...               # App password (not main password)
ATPROTO_INDEX_ENABLED=true             # Enable Jetstream indexer
ATPROTO_INDEX_REPOS=did:plc:...        # Comma-separated DIDs to backfill on startup
ATPROTO_JETSTREAM_URL=wss://jetstream2.us-west.bsky.network/subscribe  # Optional override
```

### How AT-URIs Work as claimAddress
- When we publish a claim to ATProto, the AT-URI (`at://did:plc:xyz/com.linkedclaims.claim/tid`) is stored back in `claimAddress`
- When we import a claim from ATProto, the AT-URI IS the `claimAddress`, CID goes in `proof`, repo DID goes in `issuerId` (type `DID`)
- The pipeline uses `claimAddress` as `nodeUri` for CLAIM nodes in the graph — this makes claims-about-claims link naturally via AT-URI
- Publisher skips claims where `claimAddress` starts with `at://` (don't re-publish)
- Report endpoint looks up claim nodes by AT-URI first, falls back to legacy URL

### DB Mapping (no schema changes)
Full mapping: `~/work/3-22-2026-atproto-claim-mapping.md`

| ATProto | Claim column | Notes |
|---|---|---|
| AT-URI | `claimAddress` | `at://did/collection/rkey` |
| CID | `proof` | content hash |
| repo DID | `issuerId` | + `issuerIdType = DID` |
| `subject` | `subject` | |
| `claimType` | `claim` | |
| `source.uri` | `sourceURI` | |
| `evidence[]` | Image table | one row per item |

### Server-Fallback Publishing (design decision, 2026-04)

When a user doesn't have a Bluesky account (no OAuth session), the server publishes
their claim to ATProto using the server's own app password. The claim lands in the
server's repo, not the user's. To make provenance clear, the existing `source` field
on the ATProto record carries the original author info (sourceURI, howKnown, etc.) —
no new fields needed.

User emails must NEVER be included in ATProto records. Emails are auth-only data.
The `source` object, `issuerId`, `statement`, and every other published field must be
checked to ensure no email address leaks onto a public protocol. If a user's only
identifier is an email, use their LinkedTrust profile URI or omit the identifier
entirely — do not publish the email.

See `src/services/atprotoPublisher.ts` — the fallback path is the `!result` branch
around line 197.

### Validation Claims
- A validation claim has `subject` = the URI of the thing being validated
- The `issuerId` = the person/entity making the validation
- This is true whether validating a LinkedIn profile, a GitHub repo, or another claim
