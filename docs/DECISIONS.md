# TrainLive — Architecture decisions (2026-11-04)

## Class isolation is a security boundary
PostgreSQL 15+ with mandatory class_id on all participant-derived data, composite class foreign keys, and database Row Level Security. The runtime DB role must not own tables or have BYPASSRLS. The backend validates a signed class-scoped token, then starts a transaction and uses SET LOCAL for the class and participant/staff identity. Untrusted callers never receive SQL credentials. A class-specific filter in application code alone is not accepted.

## Publishing and cloning
Content is mutable only in draft. A published ContentVersion is immutable; a new version must be created to change content. Classes snapshot all items and worksheets in their creation transaction. Cloning a class creates a new class and configuration only, never copies participants or submissions.

## Architecture and release
Next.js App Router, Postgres, and a class-authorized realtime transport (Supabase Realtime or WebSocket gateway) are the target. The current Vercel site is an initialization page. This first change is schema and security only: it must not be presented as functioning polling, quiz, or participant login. A proper seeded class, signed JWT service, websocket authorization, and deployment with load testing are required before production activation.

## Security decisions
Class claims in SQL GUCs are not inherently trustworthy because SQL clients can set them. Only a trusted API server must set these values after verifying tokens. No direct participant SQL access. Join codes must be random and revocable. Anonymized polling must not retain participant_id in responses. Ledger rows are append-only and keyed for idempotence; test scores do not enter the ledger.

## Release gates
Real database tests for two simultaneous classes and 403 cross-class token checks; post-publish immutability; per-class CSV/XLSX/PDF export verification; 600-user load test; accessibility >=90; audit log verification; and signed-off data-retention policy. No claims of passing tests until executed.