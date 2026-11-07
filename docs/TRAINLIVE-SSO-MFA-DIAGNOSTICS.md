# TrainLive — SSO/MFA Production Diagnostics

**Environment:** Vercel Production `ct` · `https://ct-kohl.vercel.app`

## Staff access (without bypass)

- Super Admin: `https://ct-kohl.vercel.app/admin/login`.
- Facilitator: `https://ct-kohl.vercel.app/host/{full-class-uuid}`. The 8-character class badge is *not* a URL-ready identifier.
- Participant join codes are not staff credentials. Staff operations remain protected by verified OIDC identity, an MFA claim, and DB role/class mapping.

## Non-sensitive readiness check

Open `/api/auth/staff/check?classId={full-class-uuid}` under the production domain, or use **Uji koneksi SSO** on the facilitator console.

| Status | Interpretation | Action |
|---|---|---|
| `provider_reachable` | App configuration is accepted and OIDC discovery metadata can be fetched. **Does not prove** a complete user login. | Continue with SSO + MFA login. |
| `configuration_required` | An app configuration prerequisite is absent or invalid. | Verify Vercel Production environment variables, then redeploy. |
| `provider_unreachable` | Config exists but OIDC discovery failed. | Verify Auth0 availability, issuer, DNS and server egress. |
| `origin_mismatch` | The request is not on the configured public origin. | Use the canonical production domain. |
| `invalid_class` | The class ID is not a complete UUID. | Retrieve the class's full ID from the administrator console. |

Only the coarse status code is returned; no issuer, token, secret, client ID, or identity is exposed. The provider discovery check is cached briefly per process to avoid unnecessary repeated outbound requests.

## Auth0 Regular Web Application settings

In **Auth0 Dashboard → Applications → Applications → [TrainLive application] → Settings** verify:

- Application Type: **Regular Web Application**.
- Allowed Callback URLs includes the *exact* string `https://ct-kohl.vercel.app/api/auth/staff/callback` (no trailing slash).
- Allowed Logout URLs includes `https://ct-kohl.vercel.app`.
- Allowed Web Origins includes `https://ct-kohl.vercel.app` where required.
- Client ID, client secret, and Auth0 tenant/domain match the Production Vercel configuration.
- Auth0 MFA enrollment and enforcement are enabled. TrainLive only accepts an approved `amr` MFA indicator or an explicitly allowlisted `acr`; it never skips MFA.

## Vercel project `ct` → Settings → Environment Variables

Check that the following are set for **Production** (configure in the Vercel UI; never paste secrets in a ticket/chat, commit them to Git, or export their values to logs):

- `TRAINLIVE_OIDC_ISSUER`
- `TRAINLIVE_OIDC_CLIENT_ID`
- `TRAINLIVE_OIDC_CLIENT_SECRET` (confidential Auth0 application)
- `TRAINLIVE_OIDC_ALLOWED_EMAIL_DOMAINS`
- `TRAINLIVE_APP_ORIGIN` = `https://ct-kohl.vercel.app`
- `TRAINLIVE_JWT_SECRET` (minimum 32 bytes)

Changing environment values requires a new Production deployment. Do not use Preview deployment results to claim Production SSO is operational.

## Diagnosing OAuth failures without exposing secrets

Open Vercel **Runtime Logs** for the exact failed login request. Filter by:

- `trainlive.staff.oidc_start_failed`: OIDC provider discovery failed.
- `trainlive.staff.oidc_callback_failed`: contains **stage** `discovery`, `token_exchange`, `identity_and_mfa`, `class_authorization`, or `session`, and login type `admin` / `facilitator`. No personally identifiable information or credentials are logged.

Interpretation:

1. **discovery** — issuer URL, provider metadata, DNS or outbound connectivity.
2. **token_exchange** — client authentication method/secret, code exchange or callback URL mismatch.
3. **identity_and_mfa** — invalid token, audience, nonce, verified email domain, or missing MFA evidence.
4. **class_authorization** — the authenticated staff identity is not mapped to the requested class/role or Super Admin.
5. **session** — session signing/cookie failure.

## Production acceptance gate

1. Confirm the production deployment SHA matches `main`, state `READY`.
2. Confirm the readiness check reports `provider_reachable` for a valid class UUID.
3. Test the *actual* user sign-in with Auth0 and MFA; complete the callback without a 403.
4. Confirm the correct class dashboard appears and the user can see permitted actions (observer remains read-only).
5. Test a staff identity not assigned to this class is denied.
6. Never claim Auth0 login end-to-end verification from a successful build or OIDC discovery alone.
