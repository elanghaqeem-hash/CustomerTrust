# TrainLive — controlled class creation (migration 010)

The existing `create-class.mjs` initial bootstrap and published seed remain the
single source of truth. **No participant data is copied when creating a class.**

After migrating 001–010, a class facilitator with an **explicit
`staff_user.is_super_admin=true` assignment** can create a new session
from an existing approved published course using the browser admin interface:
`/host/SOURCE_CLASS_UUID/admin`. All actions pass through a class-scoped
signed staff session, a restricted PostgreSQL role and a `SECURITY DEFINER`
function that independently verifies class staff assignment and super-admin
authorization. Unassigned staff, observers, cohosts and ordinary facilitators
cannot create sessions.

The operator first creates the initial source class using
`tools/trainlive/create-class.mjs`, provisions the class staff with the
existing secure SSO mapping, obtains explicit administrator-role approval,
and runs:

```bash
node tools/trainlive/promote-admin.mjs \
  <SOURCE_CLASS_UUID> <approved-staff-email> APPROVE-TRAINLIVE-SUPER-ADMIN
```

The script requires `DATABASE_URL_ADMIN` in the operator's private
environment and records a database audit entry. Do not share this URL,
bearer tokens or private class join codes in GitHub, a ticket, or chat.

New classes inherit the *published master content snapshot* and capacity,
not any participant, response, attendance, score, worksheet submission, chat,
follow-up or personal data from the source class. The admin is assigned to
the new class as facilitator. Classes use WITA, 09.00–16.00, join window
from 24h before training start until 24h after end, and a cryptographic
six-character join code. The interface displays the code only to the
authorized administrator for controlled distribution to participants.

Security validation must cover unassigned/observer/cohost/ordinary facilitator
denials, new-class empty participants, 16 items and five worksheets, distinct
source/target class IDs, no answer leakage, and privileged audit events.

**Live availability is still blocked** until compatible PostgreSQL,
OIDC+MFA and all mandatory P0 gates (backup, UAT, DPIA/data residency) pass.
Code and disposable CI tests are not proof of operating production readiness.

## Start and close a scheduled class (migration 011)

The facilitator or co-host opens `/host/CLASS_UUID`. A new class starts
as `scheduled`; the **Mulai kelas** button transitions it to `live`
within the approved join window. Only a live class can open quiz items.
After the session, **Tutup kelas** irreversibly transitions to `closed`.
Observers cannot manage state, and both actions are recorded in the audit
log. The staging-only token provisioning script supports
`--leave-scheduled` for controlled lifecycle testing; it is not an
alternative to production SSO/MFA.
