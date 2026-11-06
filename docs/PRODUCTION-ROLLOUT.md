# Production rollout — Smart Router 0.4 beta

Status: **NO-GO**, until the isolated staging acceptance tests and dependency merges are complete. This checklist is not permission to change production.

## Current topology
- Production: OpenClaw on Ubuntu, profile `~/.openclaw`, Gateway `openclaw-gateway.service`, port 18789. Git-based installation tracks `main`; Telegram mode `prefix`. Do not overwrite its profile, session state, token, or installed plugin checkout.
- Staging: separate profile `~/.openclaw-routerstage`, Gateway `openclaw-routerstage-telegram.service`, port 19451, plugin loaded from worktree `openclaw-smart-router-evidence`, native routing and experimental `!dual` enabled.
- Production trust inspection previously reported `provenance-invalid` for the existing Git plugin checkout; resolve and re-verify plugin installation provenance before enabling new behavior.
- PR dependencies: PR #4 (conversation memory), PR #5 (native model routing, based on #4), PR #6 (evidence/research/continuity, based on #5). Do not squash or merge out of order without checking base branches.

## Before requesting production approval
1. Run `npm run check && npm test` in the experimental MacBook worktree and save the output.
2. Confirm staging `gateway ready`, isolated Telegram delivery, PAIR/Colab routing, evidence collection, source audit, and correct-language replies.
3. Exercise retry on injected Colab HTTP 503 with same-provider recovery and permanent 401 fail-closed; **do not rely solely on unit tests**.
4. Exercise two native Telegram turns with one `!dual`, a Gateway restart between turns, and a follow-up question that requires the prior review. Inspect `dual-continuity status` and the next-turn model behavior; the next-turn injection is **not** an ordinary transcript append.
5. Test native `before_model_resolve` failover for an inference-time 503 and record the effective provider used. A configured `fallbacksOverride` alone is not evidence of successful failover.
6. Re-run the release gate `node scripts/release-preflight.mjs`. It is read-only and intentionally reports NO-GO when PRs are open or production is not configured for the target mode.
7. Obtain explicit approval for GitHub PR merges and a separate production maintenance/restart authorization.

## Deployment sequence (only after approval)
1. Capture a verified backup/snapshot of production profile and database using supported OpenClaw backup tools, plus an independent copy of the exact plugin Git revision. Do not truncate or edit SQLite.
2. Merge PR #4, then #5, then #6, verifying ancestry and a clean `main` before each merge.
3. Upgrade the Git-installed production plugin from the approved main revision using the supported OpenClaw plugin management flow. Verify installation provenance and plugin registration. Do not point production directly to the experimental worktree.
4. Enable native routing and only the approved subset of experimental features. Explicit `dualMode.productionEnabled` must be true in the production plugin config before the dual sender may target port 18789. No automatic paid API fallback.
5. Validate production configuration, then restart only `openclaw-gateway.service` during the approved window. Do not restart Colab or other production services unnecessarily.
6. Check session continuity, effective routing, one production Telegram smoke, no payment, health, and logs. Keep staging independent.

## Rollback
- Revert production plugin to recorded pre-release Git revision and restore the pre-change production configuration from backup; preserve user sessions, database and Telegram token.
- Restart only the authorized production Gateway. Verify the old `prefix` command and normal Telegram replies.
- Do not use `doctor --fix`, database deletion, clean resets, or destructive recovery without additional explicit approval.

## Known limitations
- Bounded Colab 502/503/504 retry in direct `!dual` is not a guarantee of native OpenClaw fallback.
- Durable next-turn context injection is not retroactive transcript persistence.
- Background jobs still do not resume automatically after a Gateway restart.
- Source audit is not a general fact checker; only retrieved, allowlisted official docs provide bounded source evidence.
- Production mode starts disabled in code and cannot activate without the explicit profile flag.
