# TrainLive 600-user load acceptance

## Preconditions
- Use an isolated staging DB and environment, **never an operating class or real participant data**.
- 24 freshly created classes with capacity 25 each; 24 class codes supplied via a temporary environment variable.
- Set `BASE_URL` to the HTTPS staging app and `CLASS_CODES_JSON` to a JSON array of the 24 codes.
- Validate `/api/health`, DB provider quota, connection pool capacity, and backup before running.

## Run
```bash
BASE_URL='https://staging.example' CLASS_CODES_JSON='["CODE01","CODE02", "... 22 more codes"]' k6 run load/k6-600-users.js
```

The test runs 600 concurrent virtual users, one iteration each. Every virtual user joins a single class, fetches items, posts attendance and fetches the leaderboard.

## Acceptance
- 600/600 synthetic joins; 24 classes isolated; no duplicate responses or cross-class exposure.
- p95 latency less than 1500ms, HTTP failure rate less than 1%.
- Measure concurrent DB connections, timeouts, 5xx, and application memory.
- Run separate WebSocket realtime performance testing once a provider is connected.
- Record environment, DB tier, commit SHA, timestamp, k6 JSON summary, and incident notes before signoff.

**Status: test prepared but not executed**. Production database and app deployment prerequisites remain open.

## GitHub Actions disposable 600-user regression (added in migration 009)

The existing `TrainLive integration` CI additionally exercises a **same-source-IP**
synthetic burst of 600 joins over 24 × 25 disposable classes using its
PostgreSQL 16 service. This catches a real scenario where a branch office NAT
is shared by many training attendees. The migration introduces separate
10-minute anti-abuse quotas: 16 randomly selected, secret-keyed hashed-IP
shards at 64 attempts each (maximum 1,024 attempts/IP) plus a stable 40
attempts per hashed IP + class-code pair, without storing raw IPs or codes.
A single class remains capped at 25 by the database join function.

Run `node tools/trainlive/test-capacity-600.mjs http://localhost:3338 /tmp/trainlive-perf-codes.json`
after generating the disposable classes in CI. The test enforces 600 successful
joins, 24 unique class IDs, cross-class cookie isolation and capacity overflow
rejection, and records p95 in the GitHub Actions step summary. It **does not**
claim to measure production or remotely hosted staging networking, realtime
WebSocket delivery, or 600 sustained concurrent users. For final P2 approval,
also execute the k6 plan above against isolated managed staging and record
real p95, error rates and DB resource metrics.
