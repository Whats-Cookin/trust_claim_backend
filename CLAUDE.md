# Claude Code Notes

## Deployment (DEV Server)

**This applies to the DEV server only. Production has a different setup.**

- **Never build locally** - Jenkins handles all builds with proper nvm/Node version
- **Never restart PM2 locally** - it uses wrong Node version, breaks the app
- **Always push to dev branch** - Jenkins auto-builds and deploys on push

## Environment Variables (DEV Server)

- `.env` is **not** persisted - Jenkins recreates it on every deploy
- Env vars are hardcoded in Jenkins job shell script (not in Jenkins UI env settings)
- Location: `/var/lib/jenkins/jobs/Trustclaim_backend/config.xml`
- To add new env vars: edit the shell script's echo command that creates .env

## Video Storage

Uses generic `LT_STORAGE_*` env vars for S3-compatible storage:
- `LT_STORAGE_ENDPOINT`
- `LT_STORAGE_KEY`
- `LT_STORAGE_SECRET`
- `LT_STORAGE_BUCKET`
- `LT_STORAGE_REGION`
- `LT_STORAGE_CDN_URL`

These must be added to Jenkins config to persist across deploys.

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

### Validation Claims
- A validation claim has `subject` = the URI of the thing being validated
- The `issuerId` = the person/entity making the validation
- This is true whether validating a LinkedIn profile, a GitHub repo, or another claim
