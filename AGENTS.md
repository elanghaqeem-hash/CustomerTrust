# AGENTS.md — CustomerTrust

## Source of truth
- Repository: `elanghaqeem-hash/CustomerTrust`
- Default integration branch: `main`
- All substantive CustomerTrust project file changes requested in ChatGPT must be reflected in this repository, not left only in chat, whenever the connected GitHub tools support the required file operations.

## Required workflow on every project-file change
1. **Sync / inspect**: Confirm the repository and default branch, read latest versions of target files, and inspect related dependencies before editing.
2. **Implement**: Apply requested changes to the actual repository files. Keep the smallest sensible diff and preserve existing work.
3. **Validate**: Run applicable checks (tests, build, lint, preview, manual validation) whenever available. State any checks that could not be run.
4. **Commit and push in the same interaction**: Use available GitHub tools to commit all completed, validated project file updates to the repository. Use concise descriptive commit messages. Prefer `main` for low-risk, non-breaking changes when permitted. For high-risk, disruptive or protected-branch changes, use a branch and PR; merge only after required checks/approval.
5. **Verify**: Read back or inspect the successful commit and changed file content where practical. Report branch, commit SHA, paths changed, checks, and any blockers.
6. **Transparency**: Never say a change is live, pushed, merged, or synchronized without a successful corresponding operation. If GitHub cannot be reached, provide changed content as a fallback and explicitly say it is **not yet committed**.

## Chat / GitHub boundary
- Chat messages, generated images, presentation outputs, and files are **not automatically mirrored** by GitHub simply because they appear in the conversation. GitHub synchronization requires an actual connector write for each deliverable.
- When a change produces a document, image, slide, or binary asset, upload the actual verified artifact using a supported file workflow; do not commit an empty placeholder or claim upload if the connector cannot write it.
- These instructions govern subsequent CustomerTrust work when the agent can access and modify this repository; they do not install a persistent webhook or autonomous background synchronization.

## Safety and quality
- Never commit secrets, credentials, tokens, personal data, or environment files.
- Avoid destructive or force pushes. Respect branch protection, approvals and CI.
- Preserve attribution and project document fidelity; avoid unrequested content rewrites.
- When implementation is blocked, disclose what was and was not completed.

## Production deployment target — Vercel
- **Production URL:** https://ct-kohl.vercel.app/
- **Vercel project:** `ct` (project ID `prj_csqddt8RBv8OEk33vJi2WObzHvR8`).
- **Vercel team:** `collman` (team ID `team_Y6DNKOu4wHEjmSax8LeZ1B7J`).
- **Git source:** GitHub `elanghaqeem-hash/CustomerTrust`, branch `main`.
- Git integration is already linked; pushes to `main` trigger Vercel production builds.
- After every successful code commit affecting deployment, verify Vercel's **latest production deployment SHA and READY state**, then request the production URL and confirm HTTP 200 and relevant UI/functional checks. A READY build alone does not prove the app works.
- If the build or smoke test fails, report the failure, inspect Vercel logs and correct it; never claim the deployment is live before verification.
- Do not deploy placeholder-only features as completed product features; the initial `index.html` is an explicit landing page pending functional TrainLive implementation.
