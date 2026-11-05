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
