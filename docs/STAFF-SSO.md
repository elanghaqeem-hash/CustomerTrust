# TrainLive staff SSO / MFA — activation gate

The P0 OIDC implementation is **fail-closed** and requires a configured enterprise identity provider. Adding this code **does not activate SSO automatically**.

## Required private Vercel production settings

- `TRAINLIVE_APP_ORIGIN=https://ct-kohl.vercel.app`
- `TRAINLIVE_OIDC_ISSUER=https://<approved-issuer>`
- `TRAINLIVE_OIDC_CLIENT_ID=<registered-client-id>`
- `TRAINLIVE_OIDC_CLIENT_SECRET=<registered-secret>` when using confidential client authentication
- `TRAINLIVE_OIDC_ALLOWED_EMAIL_DOMAINS=<approved-bank-domain>`
- `TRAINLIVE_OIDC_MFA_ACR=<approved-acr>` optionally, if the ID token has no recognized `amr` MFA method
- `TRAINLIVE_OIDC_ACR_VALUES=<acr>` optionally, sent as `acr_values` to request MFA step-up at login
- `TRAINLIVE_OIDC_REQUEST_AMR=true` optionally, requests `amr` through the OIDC `claims` parameter
- `TRAINLIVE_OIDC_TOKEN_AUTH=client_secret_post|client_secret_basic` (default `client_secret_post`)

## MFA evidence accepted by the callback

Login succeeds only when the ID token proves MFA by **one** of:
`amr` contains `mfa`; or `amr` contains `pwd` plus `otp`/`webauthn`/`fido`/`hwk`;
or `acr` equals a value listed in `TRAINLIVE_OIDC_MFA_ACR`. Enforce MFA in the IdP
policy as well; the claim check is the application's second gate.

## IdP setup notes (confirm against the provider's current docs and a test login)

| IdP | Issuer | Client | MFA evidence |
|---|---|---|---|
| Keycloak (self-hosted / bank IdP) | `https://<host>/realms/<realm>` | Confidential, Standard flow, PKCE S256 required | Configure an LoA/step-up flow with OTP/WebAuthn; set `TRAINLIVE_OIDC_ACR_VALUES` and `TRAINLIVE_OIDC_MFA_ACR` to the LoA value (e.g. `2` or your mapped name) |
| Okta / Auth0 | org or tenant issuer URL | Web app, auth code + PKCE | Require MFA in the sign-on/action policy; verify the ID token `amr` contains `mfa` |
| Microsoft Entra ID | `https://login.microsoftonline.com/<tenant-id>/v2.0` | Web platform redirect URI, client secret | Require MFA via Conditional Access; **check a real ID token** — if `amr` is absent, add an approved `acr` mapping, otherwise login is correctly rejected |
| Google Workspace | `https://accounts.google.com` | Web client | Enforce 2SV in Workspace; enable authentication-strength claims in Google Auth Platform (published/verified app) and set `TRAINLIVE_OIDC_REQUEST_AMR=true`. Google may still omit `amr`, in which case login is rejected |

## Selected IdP: Google Workspace — setup

Code behaviour when `TRAINLIVE_OIDC_ISSUER=https://accounts.google.com`:
accepts `iss` as `https://accounts.google.com` or `accounts.google.com`; requires
the `hd` (hosted domain) claim to equal the staff email domain, so unmanaged consumer
Google accounts using the bank's address are rejected; sends `hd=<domain>` as an
account-chooser hint when exactly one domain is allowed.

1. **Workspace Admin console** (bank/company admin): enforce 2-Step Verification for
   the staff organizational unit; prefer security keys/passkeys.
2. **Google Cloud console → Google Auth Platform** (project owned by the organization):
   - Branding + Audience: user type **Internal** (only that Workspace's accounts).
   - Clients → Create client → **Web application**.
     Authorized redirect URI: `https://ct-kohl.vercel.app/api/auth/staff/callback`
     (staging: a separate client with the staging origin).
   - Settings → Advanced settings → enable **Authentication strength claims**.
     Google documents this as requiring the app to be *In production* and *Verified*;
     confirm what the console shows for an Internal app.
3. **Vercel `ct` → Production env (Sensitive):**

   | Name | Value |
   |---|---|
   | `TRAINLIVE_APP_ORIGIN` | `https://ct-kohl.vercel.app` |
   | `TRAINLIVE_OIDC_ISSUER` | `https://accounts.google.com` |
   | `TRAINLIVE_OIDC_CLIENT_ID` | the `…apps.googleusercontent.com` client ID |
   | `TRAINLIVE_OIDC_CLIENT_SECRET` | the client secret |
   | `TRAINLIVE_OIDC_ALLOWED_EMAIL_DOMAINS` | the Workspace domain, e.g. `banksulteng.co.id` |
   | `TRAINLIVE_OIDC_REQUEST_AMR` | `true` |

   Leave `TRAINLIVE_OIDC_ACR_VALUES`, `TRAINLIVE_OIDC_MFA_ACR` and
   `TRAINLIVE_OIDC_TOKEN_AUTH` empty (Google supports `client_secret_post`).
4. **Staff records** (migration owner): insert each facilitator's Workspace email into
   `trainlive.staff_user` and assign the class in `trainlive.class_staff`
   via `node tools/trainlive/assign-staff.mjs CLASS_UUID email@domain facilitator "Nama"`.
   The first login binds Google `sub`.
5. Redeploy and test `/host/<CLASS_UUID>` → *Login SSO* with: an assigned MFA account
   (must pass), an unassigned account, a consumer/unmanaged account and an account
   without 2SV (all must be rejected).

**Known risk:** Google returns `amr` only when it has authentication-method
information, even when requested. If a correctly configured, 2SV-enforced staff
login is rejected with "MFA claim missing", the code is working as designed. Options
then: (a) put an MFA-asserting broker such as Keycloak in front of Google, or
(b) accept Workspace-enforced 2SV + `hd` as MFA evidence — a security-policy decision
that needs written bank sign-off and a code change; it is **not** enabled.

For every provider: redirect URI exactly `https://ct-kohl.vercel.app/api/auth/staff/callback`
(staging: its own origin), scopes `openid email profile`, and staff emails must be
verified (`email_verified=true`) in an approved domain.

Register exact OIDC callback `https://ct-kohl.vercel.app/api/auth/staff/callback`.
The provider must support authorization code + PKCE S256, ID token signature verification,
OIDC discovery, email_verified=true and an MFA indication in `amr` or approved `acr`.
Never use `NEXT_PUBLIC_` keys for secrets.

Apply migration `007_staff_oidc.sql` **after** migrations 001–006 with the trusted
database migration owner. The web user must only receive the restricted
`trainlive_app` role. Pre-provision staff emails in `trainlive.staff_user`,
assign each staff account in `trainlive.class_staff`, and require the user to
authenticate using that verified email. On first successful login, the trusted
issuer+subject are bound to the pre-authorized staff record; subsequent mismatches
are rejected. Identity changes need controlled, audited DBA intervention.

Staff URL: `/host/CLASS_UUID`. The login button starts PKCE, state and nonce
binding, checks cryptographic ID-token signatures, issuer, audience,
verified email domain, MFA and existing per-class staff assignment.
Successful login creates an 8-hour HttpOnly Secure SameSite=Lax session cookie.
OIDC secrets and tokens are never exposed to the browser JavaScript.

**Vercel production rejects manually pasted staff Bearer JWTs.**
This is intentional even if no SSO provider is configured; in this state
the facilitator cannot operate the class and the rollout is NO-GO.
CI and local/staging runtime can still exercise temporary bearer fixtures
when VERCEL_ENV is not production.

Validate with an approved MFA-enabled account and separately with denied
accounts: unassigned class, mismatched OIDC subject, missing MFA, wrong issuer,
unverified email, expired state, missing nonce and wrong redirect origin.
Source-level checks and PostgreSQL CI tests are **not substitutes** for
live provider integration and browser UAT.

Production `/api/health` requires the full SSO configuration and the
`resolve_staff_oidc` database migration to pass. CI uses a disposable
PostgreSQL database and does not claim live production readiness.
