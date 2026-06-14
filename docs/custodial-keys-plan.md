# Trust Roots & Custodial Keys — Plan

Status: **for-now bootstrap shipped; secure custody is the intended replacement.**

## What "Sign in with LinkedTrust" needs from trust

LinkedTrust is an OIDC provider. On top of authentication it returns a **trust
signal** (the `trust` scope → `trust` claim in the id_token and `/oauth/userinfo`,
produced by `resolveTrustSignal` in `src/lib/oidc.ts`). Relying parties use that
signal to decide access. Authentication ≠ authorization: logging in does not, by
itself, grant access to a powerful app.

## Trust model (capability / delegation, anchored to a root)

- **One configured anchor**: the LinkedTrust **server root key**. Everything else
  is claims — roots are not a static config list.
- **Capability claim** (root → org): the root key signs *"DID X is a trust-root
  for org Y"* (`claim=HAS_CAPABILITY`, `object=<org>`, `aspect=trust-root`).
- **Grant claims** (org root → person): a root grants a person access/role for an
  app.
- `resolveTrustSignal(user)` resolves the user → subject DID → walks grant claims
  whose issuer is a verified root (capability traces back to the anchor) → returns
  the signal.

### Why the signer matters, not the predicate
Anyone can POST a row with `claim=IS_A`/`HAS_CAPABILITY` and any `issuerId` — the
string `issuerId` is **not** trustworthy (today only 9 of ~86k claims carry a
real `proof`). Trust comes from the **signature**: a capability/grant counts only
if its `proof` verifies against the expected signer key. So **the org must have a
key**, and each link in the chain must be signed and verified — never trusted by
row existence.

### A user's Bluesky/Google identity cannot sign here
A Bluesky `did:plc:…` is controlled by the user's PDS; LinkedTrust never holds that
key and **cannot sign as it**. Google/GitHub users have no signing key at all. So
LinkedTrust signs **custodially**: the user authenticates, and the server signs on
their authority. The user's DID is the **identifier** (who), the server key is the
**signer** (authority).

## For-now implementation (shipped)

- Dedicated ed25519 **server root key**, identity = a self-certifying
  `did:key:z6Mk…` (public key is in the identifier → no registry needed to verify).
- Stored in `.env` as `LT_ROOT_PRIVATE_KEY` / `LT_ROOT_PUBLIC_KEY` / `LT_ROOT_DID`.
- `scripts/issue-root-capability.ts` — generates the key (once) and signs a
  capability claim (`prepareServerSigning` + ed25519, proof stored on the Claim row,
  `verificationMethod = LT_ROOT_DID`).
- `scripts/verify-root-capability.ts` — verifies signature + that
  `verificationMethod` matches `LT_ROOT_DID` (mirrors the downstream check).
- Bootstrapped: `did:plc:3akk2lpjh6vz7yr74j2wgjk6` (Golda) as trust-root for
  `linkedtrust.us`.

### Known limitations of for-now
- Keys are **plaintext in a dotfile**. A host/app compromise leaks the root.
- No rotation, no per-org/per-user key isolation, no audit of signing operations.
- `resolveTrustSignal` does not yet consume these claims (still a stub) — that is
  the next step.

## Target: secure custodial keys with a robust library

Goals:
1. **No plaintext private keys on disk.** Keys held in a KMS/HSM (cloud KMS, or
   a self-hosted vault), or at minimum encrypted at rest with a separately-managed
   data key. The app calls a *sign* operation; it never sees raw private keys.
2. **Per-org / per-user custodial keys** with isolation, so one compromise is
   contained and signing is attributable.
3. **Rotation + revocation** with key ids, and an auditable log of signatures.
4. **A robust, audited library** rather than hand-rolled crypto — for both signing
   (e.g. a KMS-backed signer, or a DID/VC framework such as Veramo / Spruce
   `ssi`/`didkit`) and **secure key exchange** when keys or delegations move
   between parties (e.g. libsodium sealed boxes / DIDComm), instead of bespoke flows.
5. **Standard proofs** (Ed25519Signature2020 / data-integrity VCs) so claims are
   independently verifiable off-platform.

Migration: keep the `did:key` root identity and the capability/grant claim shapes;
swap the *signing backend* from "ed25519 PEM in `.env`" to a KMS/library-backed
signer. Verification logic (verify proof against the configured root DID) is
unchanged, so downstream consumers don't break.

## Gates are not always hard

`resolveTrustSignal` should return a **graded** signal (roles / levels / evidence),
not a binary `approved`. Each consumer interprets it for its own risk level:

- **Hard gate** (e.g. amebo — powerful): require an explicit grant from a verified
  root before access.
- **Soft gate** (e.g. a Discord): admit anyone who shows **demonstrated work**
  (existing claims/endorsements about them), no manual approval needed.
- **Algorithmic** (e.g. ranking, labeling, or filtering social-media posts): feed
  the trust level/score into an algorithm rather than an allow/deny decision.

So the return shape should carry enough for all three: e.g.
`{ roots: [...], roles: [...], level, evidence: [...] }` — consumers pick the
threshold and meaning.
