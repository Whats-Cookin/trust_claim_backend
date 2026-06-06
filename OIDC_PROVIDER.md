# LinkedTrust OIDC Provider ("Sign in with LinkedTrust")

LinkedTrust acts as an OpenID Connect provider so other apps (Marten/Taiga, the
Odoo CRM, RaiseTheVoices, amebo, abra, …) can offer **"Sign in with LinkedTrust"**.
It is a *trust* provider, not just a login provider: every login returns identity
**and** a trust signal (the `trust` scope, on by default).

All of this is **additive** — the existing `/auth/*` login routes (Google, Bluesky,
GitHub, LinkedIn, wallet, password) are untouched. Users authenticate *at* LinkedTrust
with those existing methods; relying apps consume the result over standard OIDC.

## Endpoints

| Path | Purpose |
|------|---------|
| `GET  /.well-known/openid-configuration` | OIDC discovery document |
| `GET  /.well-known/jwks.json` | Public signing key (Ed25519 / EdDSA) |
| `GET  /oauth/authorize` | Start login; issues an authorization code |
| `POST /oauth/token` | Exchange code → `id_token` + access token |
| `GET  /oauth/userinfo` | Bearer-authenticated identity + trust claims |
| `POST /oauth/session` | Frontend posts a LinkedTrust token here to set the durable IdP session cookie |

- **Signing:** EdDSA, using the existing `SERVER_PRIVATE_KEY`/`SERVER_PUBLIC_KEY`
  Ed25519 keypair already in `.env`. If a client library can't do EdDSA, add an
  RS256 key to the JWKS later (no client change beyond key selection).
- **Default scopes:** `openid profile email trust`. `trust` is granted by default.
- **Trust signal** is currently a **stub** (`resolveTrustSignal()` in `src/lib/oidc.ts`)
  returning `{status:"stub", …}`. Wiring vouch / roots-of-trust resolution from the
  Claim graph is a drop-in replacement of that one function — no flow changes.
- **Durable session:** a 30-day, sliding `lt_idp_session` cookie. Log in once, stay
  logged in across every "Sign in with LinkedTrust" app (Google-grade SSO).

## Code

- `src/lib/oidc.ts` — signing, JWKS, discovery doc, scopes, `resolveTrustSignal()` stub.
- `src/api/oidcApi.ts` — the endpoints + the IdP session cookie.
- `src/index.ts` — route mounts (search `OIDC provider`).
- `scripts/register-oidc-client.ts` — register relying apps.
- Frontend bridge: `trust_claim` `src/containers/Login/index.tsx` (the `lt_oidc` /
  `return_to` handling).

## Deploying to live (live.linkedtrust.us)

1. **Merge `feat/oidc-provider`** and pull on the live backend host (VM 508).
2. **Run the migration as a privileged role.** The app DB user typically lacks
   `CREATE` on schema `public`. Two cautions, both seen on dev:
   - Live's DB may have the same atproto-migration **name drift** as dev. If
     `prisma migrate status` shows a divergence on `*_add_atproto_oauth_tables`,
     reconcile non-destructively first:
     `prisma migrate resolve --applied <local_name>` and delete the orphan
     `_prisma_migrations` row (metadata only — the tables already exist).
   - Apply the OIDC migration SQL as a role that has `CREATE` (the tables' owner),
     then grant the app user DML:
     ```sql
     GRANT SELECT, INSERT, UPDATE, DELETE ON oidc_clients, oidc_auth_codes TO <app_user>;
     GRANT USAGE, SELECT ON SEQUENCE oidc_clients_id_seq TO <app_user>;
     ```
     Then `prisma migrate resolve --applied 20260606143445_add_oidc_provider`.
3. **`npm install` (adds `jose`), `npm run build`, restart the service.**
4. **Nginx / reverse proxy:** ensure these reach the backend (not the SPA):
   `/.well-known/openid-configuration`, `/.well-known/jwks.json`, and `/oauth/`
   (use exact `location =` for the two well-known paths so they don't shadow
   `acme-challenge`). On dev these were added to `dev.linkedtrust.us`.
5. **Confirm `BASE_URL`** in `.env` is the public issuer (e.g. `https://live.linkedtrust.us`).

## Registering a relying app

```bash
# Confidential (server-side app, gets a secret printed once):
npx ts-node scripts/register-oidc-client.ts \
  --name "Odoo CRM" --redirect https://crm.linkedtrust.us/auth_oauth/signin

# Public (SPA / can't keep a secret → PKCE, no secret):
npx ts-node scripts/register-oidc-client.ts \
  --name "Marten" --redirect https://marten.linkedtrust.us/oauth/callback --public
```

End users never need a client_id/secret — only the apps do, and public clients
avoid secrets entirely via PKCE.

## Per-app client setup

### Odoo CRM (crm.linkedtrust.us) — uses implicit flow

Odoo's stock `auth_oauth` uses the OAuth2 implicit flow and validates the token
server-side. The provider supports this (`response_type=token`, and `/oauth/userinfo`
accepts `?access_token=` and returns a `user_id` field). No Odoo module needed.

In Odoo: **Settings → Users & Companies → OAuth Providers → New** (or via `odoo-cli`):

| Field | Value |
|-------|-------|
| Provider name | LinkedTrust |
| Client ID | (the registered `lt_…` client_id) |
| Allowed | ✓ |
| Login button label (`body`) | Sign in with LinkedTrust |
| Authorization URL (`auth_endpoint`) | `https://<issuer>/oauth/authorize` |
| Scope | `openid email trust` |
| UserInfo URL (`validation_endpoint`) | `https://<issuer>/oauth/userinfo` |

Register the client with the Odoo redirect URI:
`scripts/register-oidc-client.ts --name "Odoo CRM" --redirect https://crm.linkedtrust.us/auth_oauth/signin --public --scopes "openid email trust"`

NOTE: crm.linkedtrust.us is the live team CRM — apply this when ready; it does not
change existing password login, only adds the button.

### Taiga (marten.linkedtrust.us, help.raisethevoices.org) — code flow

Taiga needs a contrib auth plugin on the **taiga-back** server (it can't consume
OIDC by config). See `taiga-contrib-linkedtrust-auth/` and its README for install
steps. Deploy to both Taiga servers.
