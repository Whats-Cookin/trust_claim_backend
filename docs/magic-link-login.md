# Magic-Link Login — Design Discussion

Status: **nothing built. Discussion + next steps only.**

Leaning: **admin mints the link and hands it over.** No email transport in the
first cut — that matches how both existing magic-link flows already work here.

## What prompted this

A user (account 253, `authType=GITHUB`) could not complete SSO into
dash.workers.vc. Root cause was a missing email, not a login problem —
`https://api.github.com/user` returns `email: null` when the GitHub account keeps
it private, and the authorize URL requested no `user:email` scope, so the account
was created with `email = NULL`. With no email the id_token and `/oauth/userinfo`
carry no `email` claim (`src/lib/oidc.ts:195`, `src/api/oidcApi.ts:312`), and a
relying party that keys accounts on email cannot finish signup.

That is fixed separately (scope added on the three frontend authorize URLs, plus
a `/user/emails` fallback and a backfill in `githubAuth`). What it exposed is the
real gap: **that account had no recovery path at all.**

- `login` (`src/api/authApi.ts:150`) requires `passwordHash`; a GitHub/OAuth/wallet
  account has none, so it always returns "Invalid credentials"
- `register` returns 409 once the email is taken, so re-registering is not a way in
- there is **no** forgot/reset route anywhere in the backend

If such a user loses access to their upstream IdP, or the relying app needs an
email-keyed identity they cannot produce, there is nothing to fall back on.

## The constraint that shapes everything: there is no mail path

Verified, not assumed:

- no `nodemailer` / SendGrid / Resend / Postmark / Mailgun / SES in
  `trust_claim_backend/src` or in `package.json`
- no mail send in the certify app (`/data/certify`) either — its deps are only
  next, react, qrcode. `nodemailer` appears solely in `/data/certify/archived/`,
  a dead tree
- no local MTA on this box — postfix is `inactive`, no `sendmail` binary
- no SPF/DKIM work has been done for outbound mail on linkedtrust.us

So "emailed reset link" is not a small feature. The token logic is the easy part;
delivery and deliverability are the whole cost.

## Both existing magic-link flows are already admin-delivered

This is the strongest argument for starting there — it is the established pattern
in this codebase, not a compromise.

**Certify credential offers** (`src/api/credentialOffers.ts`, table
`credential_offers`): `credentialAdmin.ts:121` literally returns the message
`"Credential created. Send the invite link to {email}"` — that is instruction to
the admin. `credentialAdmin.ts:109` has `// await storeOfferToken(...)` commented
out. `recipient_email` is stored but never used to send anything; of 9 offers,
1 has an email and 1 was claimed.

**SSO invites** (`bindInvite`, `src/api/oidcApi.ts:357`): minted only by
`scripts/make-sso-invite.ts` — there is deliberately no route to mint one, so
possession of a valid invite *is* the admin's authorization. Also hand-delivered.

## The token primitive to copy

`credentialOffers.ts` is the better of the two to base a reset on:

- token minted server-side; only its SHA-256 hash is stored (`hashToken`, line 8).
  The raw token exists only in the link
- lookup by hash, with a 16–128 char length guard (line 16)
- expiry via `expiresAt`
- single-use enforced by a conditional update on `claimedAt: null` (line 125) —
  atomic, so a concurrent second claim loses the race instead of double-spending

Prefer this over the `sso_invites` JWT approach: **a stored hash is revocable, a
signed JWT is not.** For account recovery, being able to kill an outstanding link
matters.

## Set a password while logged in — probably the first thing to build

A magic link is not needed for the common case. If the user can still log in via
their IdP, **that login is already proof of control** — they can just set a
password on the account they are holding. No token to leak, no email, no admin in
the loop, no window where a link sits in someone's chat history.

Shape: `POST /auth/set-password`, authenticated by the LinkedTrust access token
(same bearer check `bindInvite` already does, `src/api/oidcApi.ts:365`), which
does `prisma.user.update` on `passwordHash` for the caller's own row. If a hash
already exists, require the current password; if not, this is a first password.

### Why this is not `register`

`register` (`src/api/authApi.ts:190`) calls `prisma.user.create` — it makes a
**new row** and 409s if the email is taken. It cannot modify an existing account.
Two consequences:

- an account whose email is already set cannot re-register; it just 409s
- even where the email is free, registering produces a **new user id**, and the
  OIDC `sub` is `String(userId)` (`.setSubject(...)` in `signIdToken`,
  `src/lib/oidc.ts`). A relying party keys its account on `sub`, so a new id is a
  different person to them, and the original account keeps all the claims/history

So register forks the identity. Setting a password updates in place and preserves
`id`, and therefore `sub`, and therefore the relying party's account binding.
For recovery, account continuity is the entire point.

Note `passwordHash` is currently written in exactly one place in the backend —
`authApi.ts:214`, inside `register`. There is no set-password or change-password
route today.

One dependency: `login` looks the user up by email (`findUnique({ where: { email } })`,
`authApi.ts:158`), so a password is useless on an account with no email — it has no
way to identify itself at the login form. Any set-password flow has to either
require an email on the account first, or login needs another lookup key. This
overlaps directly with the GitHub-missing-email fix.

### What that leaves for the magic link

Only true recovery: **the user has lost access to their IdP** and therefore cannot
log in at all to set a password. That is a genuinely different and much rarer
case, and it is the one where an admin verifying identity out-of-band and handing
over a link is proportionate.

Build order follows from this: set-password first (covers nearly everyone, small,
no new infra), magic link second (covers the tail, needs the table and script).

## Proposed shape for the recovery link (not built)

1. `scripts/make-reset-link.ts` — admin-only, no HTTP route to mint, mirroring
   `make-sso-invite.ts`. Takes a user id or email, prints the link once.
2. Table `password_reset_tokens`: `token_hash` (unique), `user_id`, `expires_at`,
   `consumed_at`, `created_at`. Same shape as `credential_offers` / `sso_invites`.
3. `GET /auth/reset/:token` — validate only, return whether the token is live.
   No side effects, so the page can render an error without burning the token.
4. `POST /auth/reset/:token` — set `passwordHash`, consume the token via the same
   conditional update, invalidate any other outstanding tokens for that user.
5. Frontend route to enter the new password.

Short expiry (an hour or less) is cheap when an admin is handing the link over in
real time — there is no inbox latency to accommodate.

## Open decisions

**1. Can a reset set a *first* password on an SSO-only account?** This is the
security-relevant question. Today 91 accounts have no `passwordHash` (GITHUB 11 of
15 also have no email; OAUTH 59; plus wallet). Giving one a password converts an
SSO-only account into one that also accepts passwords. If that account's email was
never verified by us — and for GitHub it is whatever the provider handed over, or
now whatever the `/user/emails` fallback picked — then an emailed reset to that
address would be an account-takeover path. Admin-delivered links sidestep this
only as long as the admin verifies who they are handing it to.

The set-password-while-logged-in flow above largely resolves this: requiring an
active IdP session means the first password is set by someone who demonstrably
controls the account, with no reliance on the email being ours to trust. The
question then only applies to the recovery link, where it should probably be
answered conservatively — admin script only, never self-service.

**2. Is this one mechanism or three?** `sso_invites`, `credential_offers`, and now
reset tokens would be three near-identical single-use-token tables. Worth deciding
whether to generalize before adding the third, or accept the duplication because
the flows diverge later anyway.

**3. What is actually being solved?** Both existing flows are admin-delivered, so
there is no mail problem yet — there is a *no self-service* problem. Adding email
only matters once the volume of "Golda sends someone a link" becomes the
bottleneck. Until then, mail transport is deferred work, not blocking work.

**4. Does the relying app care?** For the case that started this, the account
needed an *email*, not a password. A magic link that binds a verified email to an
account may be more useful than one that sets a password — and `bindInvite`
already does approximately that. Worth checking whether reset is a genuinely new
flow or a second verb on the invite mechanism.

## Next steps

- confirm the build order: set-password-while-logged-in first, recovery link second
- decide whether the recovery link is distinct from `bindInvite` (question 4)
  before writing any table
- if set-password proceeds: one route plus a frontend form, no schema change —
  `passwordHash` already exists on `User`
- if the recovery link proceeds: schema first, then the admin script, then the two
  routes, then the frontend page
- mail transport stays out of scope until someone asks for self-service
