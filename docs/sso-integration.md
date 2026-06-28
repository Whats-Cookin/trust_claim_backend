# Sign in with LinkedTrust — SSO Integration Guide

LinkedTrust is an **OpenID Connect (OIDC) identity provider**. Your application
(the "relying party") sends users to LinkedTrust to authenticate; LinkedTrust
returns a signed identity token plus, optionally, a **trust signal** about that
user. This is standard OIDC Authorization Code flow — most OIDC/OAuth2 client
libraries work out of the box pointed at the discovery URL below.

- **Issuer:** `https://live.linkedtrust.us`
- **Discovery:** `https://live.linkedtrust.us/.well-known/openid-configuration`

Point any compliant OIDC library at the discovery URL and it will auto-configure
every endpoint below.

---

## 1. Endpoints

| Purpose | URL |
|---|---|
| Discovery | `https://live.linkedtrust.us/.well-known/openid-configuration` |
| JWKS (token signing keys) | `https://live.linkedtrust.us/.well-known/jwks.json` |
| Authorization | `https://live.linkedtrust.us/oauth/authorize` |
| Token | `https://live.linkedtrust.us/oauth/token` |
| UserInfo | `https://live.linkedtrust.us/oauth/userinfo` |

- **ID token signing:** EdDSA (Ed25519), `kid` = `server-key-1`. Verify against JWKS.
- **Scopes:** `openid` (required), `profile`, `email`, `trust`.
- **Response types:** `code` (recommended), `token` (legacy implicit, for apps that
  validate server-side via UserInfo only).
- **Token endpoint auth:** `client_secret_basic`, `client_secret_post`, or `none` (PKCE/public).
- **PKCE:** supported (`code_challenge_method=S256`).

---

## 2. Getting client credentials

Each relying party needs a `client_id` and (for confidential apps) a
`client_secret`, issued by the LinkedTrust admin. To register, provide:

- **App name**
- **Redirect URI(s)** — your OAuth callback URL(s); must match exactly at runtime
- **Client type** — confidential (server-side app, gets a secret) or public (SPA/native, uses PKCE, no secret)
- **Scopes** — typically `openid email profile trust`

You'll receive:

| Field | Notes |
|---|---|
| `client_id` | public identifier |
| `client_secret` | confidential clients only — **shown once**, store securely server-side |
| Registered redirect URI(s) | the allowlist; runtime `redirect_uri` must match one exactly |

> Keep `client_secret` server-side only. To add or change redirect URIs later,
> contact the admin.

---

## 3. The flow (Authorization Code)

```
User clicks "Sign in with LinkedTrust" on your site
        │
        ▼
1. Redirect the browser to /oauth/authorize  (top-level navigation — see Gotchas)
        │
        ▼
2. LinkedTrust authenticates the user (Google / Bluesky / etc.)
        │
        ▼
3. LinkedTrust redirects back to your redirect_uri with ?code=...&state=...
        │
        ▼
4. Your server POSTs the code to /oauth/token  → id_token + access_token
        │
        ▼
5. (Optional) Your server GETs /oauth/userinfo with the access_token
        │
        ▼
6. You have the user's identity (sub, email, name) + trust signal
```

### Step 1 — Authorization request
Send the user's browser to:

```
https://live.linkedtrust.us/oauth/authorize
  ?response_type=code
  &client_id=<your client_id>
  &redirect_uri=<your url-encoded redirect_uri>
  &scope=openid%20email%20profile%20trust
  &state=<random-csrf-token>
  &nonce=<random-nonce>
```

`state` is yours for CSRF protection — generate it, store it in the user's session,
and verify it on callback. `nonce` is echoed into the id_token; verify it matches.

### Step 2 — Token exchange (server-to-server)
```
POST https://live.linkedtrust.us/oauth/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic base64(client_id:client_secret)

grant_type=authorization_code
&code=<code from callback>
&redirect_uri=<your redirect_uri>
```
(Or send `client_id`/`client_secret` in the body instead of the Basic header.)

Response:
```json
{
  "access_token": "…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "id_token": "<JWT, EdDSA-signed>",
  "scope": "openid email profile trust"
}
```
Verify the `id_token` signature against the JWKS, and check `iss`, `aud`
(= your client_id), `exp`, and `nonce`.

### Step 3 — UserInfo (optional)
```
GET https://live.linkedtrust.us/oauth/userinfo
Authorization: Bearer <access_token>
```
```json
{
  "sub": "227",
  "user_id": "227",
  "email": "user@example.com",
  "email_verified": true,
  "name": "Jane Doe",
  "trust": { "status": "...", "level": 100, "isRoot": true, "roots": ["linkedtrust.us"], "roles": [], "evidence": [] }
}
```

- `sub` is the stable LinkedTrust user id — use it as the primary account key.
- `email`/`name` are present only if you requested the `email`/`profile` scopes.

---

## 4. The `trust` scope

If you request the `trust` scope, the id_token and UserInfo include a `trust`
object describing the user's standing in the LinkedTrust graph:

| Field | Meaning |
|---|---|
| `status` | resolution status of the signal |
| `level` | `100` = root-signed, `50` = granted, `0` = none |
| `isRoot` | true if the user is a trust root |
| `roots` | trust roots the user is anchored to (e.g. `["linkedtrust.us"]`) |
| `roles` | roles granted to the user |
| `evidence` | claims backing the signal (root-signature-verified only) |

Use it for authorization decisions if you want; it's safe to ignore if you only
need identity.

---

## 5. Client libraries (no LinkedTrust SDK needed)

There is **no LinkedTrust-specific npm or PyPI package, and you don't need one.**
LinkedTrust is a standard OIDC provider — use any generic OIDC client library and
point it at the discovery URL (`/.well-known/openid-configuration`); it will
auto-configure every endpoint.

**Node / JavaScript**
- `openid-client` — de-facto standard, full OIDC.
- `passport-openidconnect` — for Passport-based apps.
- Auth.js / NextAuth — add LinkedTrust as a custom OIDC provider (issuer URL + client id/secret).
- `oidc-client-ts` — browser SPAs (use a public/PKCE client).

**Python**
- `authlib` — recommended; supports the discovery flow and EdDSA.
- `mozilla-django-oidc` or `python-social-auth` — for Django apps.
- `requests-oauthlib` — lower-level.

> **EdDSA note:** id_tokens are signed with **EdDSA (Ed25519)**, not RS256.
> `openid-client` and `authlib` support this out of the box. Some older/stricter
> libraries default to RS256 and need EdDSA explicitly enabled — or you can use the
> authorization-code flow plus `/oauth/userinfo` and skip local id_token signature
> verification entirely.

---

## 6. Gotchas

- **Initiate sign-in as a top-level browser navigation** (`window.location = <authorize URL>`),
  not via `fetch`/XHR or a hidden iframe. The authorize endpoint 302-redirects to a
  login page; a non-navigation request silently fails to render it.
- **Account matching is by `email`.** If you match returning users to existing
  accounts, match on the `email` claim. Note some LinkedTrust identities (e.g.
  Bluesky-only logins) may carry a placeholder email; `email_verified` is asserted
  by the IdP.
- **`redirect_uri` must be pre-registered** and match exactly (scheme, host, path).

---

## 7. Quick test

Once you have a `client_id` and a registered `redirect_uri`, paste this in a
browser (URL-encode your redirect_uri). It should land you on the LinkedTrust
login page:

```
https://live.linkedtrust.us/oauth/authorize?response_type=code&client_id=<your client_id>&redirect_uri=<your url-encoded redirect_uri>&scope=openid+email+profile+trust&state=test123
```

After login it redirects to `<your redirect_uri>?code=...&state=test123`.
