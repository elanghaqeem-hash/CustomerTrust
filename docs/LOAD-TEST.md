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
