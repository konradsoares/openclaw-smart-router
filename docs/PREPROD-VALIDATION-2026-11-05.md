# Smart Router vNext — Pre-production validation (2026-11-05)

## Scope and safety
- Tested on Ubuntu OpenClaw profile `routerstage`, isolated from production; stage WebSocket port 19451.
- Production OpenClaw Gateway and Telegram bot were not reconfigured.
- No paid API calls were made and no simulated test provisioned a GPU.
- Colab's real 4K context remains inadequate for a full native OpenClaw prompt with observed 5,975-token preflight.
- This report distinguishes policy/mock checks from actual model/provider executions.

## Eight automated pre-production checks

Command: `node --test preprod-eight.test.mjs`

| Test | Method | Result | Limitation |
|---|---|---|---|
| 01 PAIR offline -> Colab | Mocked PAIR inventory failure; hypothetical 16K Colab provider; checks native modelOverride | PASS | No real PAIR outage or Colab 16K provisioned |
| 02 Colab offline -> paid API | Mocked selection and two-level opt-in gate | PASS | Did not execute paid API or real Colab outage |
| 03 2K/4K/8K/12K token budgets | Mocked history lengths; validates eligibility against configured limits | PASS | Heuristic, not actual tokenizer; only 4K Colab currently provisioned |
| 04 Native Telegram without prefix | Hook unit test, verifies native path does not intercept Telegram events | PASS | No separate staging Telegram bot or end-to-end delivery |
| 05 Concurrency and conversation isolation | Process-local serialized chat calls and distinct session IDs | PASS | Also tested two concurrent separate real CLI sessions (both returned); native same-chat concurrent CLI not load-tested |
| 06 English status/user language | Unit test checks notices and model instruction | PASS | Also tested real PAIR responses in Portuguese then English in same session |
| 07 Restart and rollback | Mock fallback to old prefix + disabled native hooks | PASS | Also restarted isolated staging Gateway and recovered prior session. Production rollback not exercised |
| 08 Observability and inventory cache | Logged route/reason/estimated tokens and no-inference PAIR inventory GET | PASS | Not yet full cost/latency dashboard or per-node VRAM telemetry |

Automated result: 8 passed, 0 failed.

## Real staging results

- Existing native session stage-native-002: PAIR -> Colab T4 -> PAIR successfully recalled ORBIT-4729, using one OpenClaw session. Confirmed from actual gateway provider override logs. Colab cold boot took roughly three minutes. This earlier test was run with 4K Colab, and the OpenClaw runtime performed context compaction.
- On 2026-11-05, fresh real PAIR sessions responded in Portuguese and English in the **same session** (preprod-lang-01).
- Two simultaneous separate OpenClaw stage sessions (preprod-concurrent-A and B) returned successful responses; no cross-chat history mixing observed.
- Restarted only staging Gateway; health returned OK and the prior stage-native-002 session returned ORBIT-4729 again.
- Native routing status log confirmed selected PAIR; no paid provider involved.

## Production blockers remaining

1. **Real automatic failover**: simulate PAIR runtime failure under OpenClaw, not just inventory absence or policy selection; validate actual Colab model invocation, retries, and same-session continuation. Current 4K Colab is intentionally ineligible after a 6K internal-overhead floor.
2. **Colab context**: configure and verify a real 8K/16K context (minimum 16K recommended) in Colab/Ollama and OpenClaw. Measure actual VRAM/latency and prompt token counts. Avoid advertising a context window unsupported by the backend.
3. **Paid fallback**: validate using a **mock** local paid-compatible provider with a controlled 429/5xx/no-response and explicit opt-in; only perform a live paid canary with a separately approved spend ceiling.
4. **Telegram staging bot**: test actual bot delivery, conversation persistence, language switching and duplicate suppression in native mode without touching @Clawdney_bot in production.
5. **Model/token calibration**: replace or supplement heuristics with runtime-provided preflight/system/tool overhead and tokenizer metrics. The fixed 6,000-token floor is conservative, not an exact capacity estimate.
6. **Rollback**: rehearse actual plugin/config switch on staging and verify session continuity after rolling back to the previous build. No destructive database cleanup.

**Decision: NO-GO for automatic native routing production.** The existing production Gateway remains on commit 228e020, using the stable explicit-prefix mode. PR #4 and PR #5 remain unmerged.


## Follow-up live staging battery, 2026-11-05

### Real isolated Colab 8K and 16K
- One T4 GPU was provisioned under a SEPARATE staging Autopilot state and port 18081. Zero runtimes existed beforehand. Production Colab port 18080 and state were not altered.
- 8K context: HTTP 200, CONTEXT_OK, 4,221 prompt tokens, 3 completion tokens, 204.5 seconds including provisioning; Ollama total 101.1 seconds.
- 16K first attempt: HTTP 502 in 34.1 seconds due to a 30-second Autopilot health check timeout.
- Raised health probe timeout to 180 seconds ONLY in the staging Autopilot code copy.
- 16K context: HTTP 200, CONTEXT_OK, 11,621 prompt tokens, 3 completion tokens, 22.2 seconds, Ollama total 12.8 seconds.
- GPU read-only metrics: Tesla T4, 15,360 MiB total, 5,003 MiB used, 9,910 MiB free.
- Explicitly deleted the runtime owned by staging and cleared its state; production Colab service stayed active.
- PASS: direct 8K/16K inference. Does not guarantee all arbitrary 16K requests.

### Actual failure-route tests, loopback-only mock providers
- Mock 18082 returned HTTP 503; mock 18083 returned MOCK_CLOUD_FALLBACK_OK. No external API used.
- PAIR inventory unavailable -> native routing selected mocked Colab and returned success. PASS for preflight fallback.
- PAIR inventory available but actual model HTTP 503 -> OpenClaw retried the same model repeatedly and ultimately failed after approximately 84 seconds, no Colab request. FAIL for in-run fallback.
- Inspected installed OpenClaw v2026.10.9: resolveHookModelSelection applies providerOverride and modelOverride, but NOT the fallbacksOverride property returned by the Smart Router hook. Existing unit tests did not exercise this integration boundary.
- Added a static allowed fallback list of Colab in staging: HTTP 503 retries grew transcript until Context overflow after approximately 139 seconds, no successful Colab fallback. FAIL.
- BLOCKING: native automatic failure fallback and bounded retry/context growth must be corrected before production.

### Mocked cloud consent (real stage)
- Added cloudmock/mock as a local OpenAI-compatible provider on port 18083 with a dummy key, no paid API provider.
- Both consent gates true and no eligible free provider -> cloudmock/mock selected and returned success. PASS.
- Both consent gates false -> mock success counter stayed at 2 before and after a failed request. PASS for no unauthorized cloud calls.
- No live paid API calls were made.

### Real same-session concurrency and rollback
- Two concurrent CLI requests using SAME OpenClaw stage-native-002 session both returned ORBIT-4729, exited 0 and were logged as separate runs. PASS.
- Switched isolated staging to a COPY of the old production plugin in prefix mode, verified plugin source, config validation, Gateway health, and remembered ORBIT-4729. PASS.
- Restored experimental plugin, restarted isolated staging, verified health and remembered ORBIT-4729. PASS.
- Production plugin, session databases and Telegram service were unchanged.

### Observability
- Logged chosen provider, reason, estimated tokens, actual provider HTTP status, mock request counts, measured Ollama prompt/completion usage, elapsed time and read-only GPU VRAM. PARTIAL: no per-node VRAM inventory or complete live cost dashboard.
- OpenClaw prompt preflight differs substantially from router's estimated budget; the 6K floor is only a conservative heuristic.

### Release conclusion
NO-GO for native automatic failure fallback. The actual runtime ignores the proposed dynamic fallback property; static fallback suffered unbounded retries and context overflow. Real Colab 16K, mock cloud gating, concurrency and rollback passed. Telegram E2E still requires a separate staging bot. Production remains on stable explicit-prefix Smart Router.

## Colab native same-session multilingual and memory probe, 2026-11-06
- Staging only: telegramMode native, dedicated Colab Autopilot port 18081 and 16,384 Ollama num_ctx; intentionally lowered staging PAIR advertised context to 1,024 to test Colab routing. Production untouched, both paid-cloud consent gates remained false.
- CLI entry to isolated Gateway with --channel telegram, same explicit session stage-colab-route-20261106, logged native-model-route colab/colab-t4 with reason colab-fallback.
- First PING attempt: HTTP 200 after 198.6 sec but returned empty content; OpenClaw performed one visible-answer continuation retry. Completed response at ~244 sec. NOT an all-green latency/fidelity result.
- Memory write: Colab answered ACK: OTTER-6418; next Portuguese retrieval (same session) correctly answered OTTER-6418 (HTTP 200, ~13.2 seconds).
- English one-sentence response (same Colab session) correctly English, HTTP 200, ~5.9 seconds.
- Next Portuguese one-sentence response correctly Portuguese, HTTP 200, ~5.5 seconds.
- **PASS for CLI->Gateway native route, model memory and multilingual turns within one OpenClaw session on real Colab.**
- **NOT VALIDATED**: actual Telegram inbound route hook and PAIR->Colab continuity in the user's Telegram session; requires human-sent Telegram message and log check. The previous no-prefix Telegram messages had no native-model-route logs.
- Staging diagnostic hook temporarily records only agent/channel/session prefix, never message contents or secrets; remove after native Telegram ingress issue is diagnosed. Avoid merging diagnostic instrumented source.

## Telegram native Colab diagnosis and language context fix (2026-11-06)
- Real Telegram inbound channelId was the numeric Telegram chat ID, not telegram; previous native hook skipped routing. Corrected in 0de6cd8, matching only explicitly listed allowed Telegram IDs (and literal telegram CLI channel).
- Telegram real ingress 00:29:33 and 00:29:51 selected colab/colab-t4 with HTTP 200, 5.695 and 6.354 sec respectively, and successful Telegram delivery. Existing PAIR-era code TIGER-8294 was recalled correctly after switching models.
- Second real Telegram answer was in English despite the user's explicit Portuguese request and repeated an earlier non-answer about not knowing the Colab integration. Language quality was FAIL.
- Improved prompt-build hook with explicit latest-user-language instructions and brief accurate Smart Router / PAIR / Colab project context (no secrets).
- Staging-only Colab CLI cold start then request timed out after ~195 sec despite the owned runtime eventually reporting ready. FAIL latency/reliability. Immediate warm retry returned a relevant one-sentence answer in Portuguese in 13.12 sec. PASS for warm provider and language. Actual Telegram language re-test remains PENDING.
- Inference-time PAIR HTTP 503 -> Colab fallback still FAIL/NO-GO: installed OpenClaw ignores hook fallbacksOverride and retry/context behavior is unbounded. Do not merge to production yet.

## Telegram isolated-session Colab verification (2026-11-06 01:02 UTC)
- Configured staging-only OpenClaw session.dmScope=per-channel-peer after repeated non-Portuguese replies with shared agent:main:main; old session preserved. Staging Gateway restarted and health returned OK.
- Actual Telegram message at 01:01:45 UTC: native-model-route colab/colab-t4, successful OpenClaw provider/model overrides, Colab HTTP 200 (8321ms provider elapsed), Telegram outbound send success at 01:02:02 UTC.
- Reply was relevant and in Portuguese. PASS for real Telegram native routing, Colab inference, and current-message language after session isolation. Clean Telegram session listed separately from agent:main:main.
- Telegram also displayed Model Fallback: colab/colab-t4 (selected nvpair/...; selected model unavailable). This is model-selection notification, not evidence of an HTTP 503: logs show HTTP 200 from Colab. Investigate OpenClaw default/persisted model metadata and notification separately.
- CAUTION: This does not validate in-run failover from PAIR HTTP 503 or cold-start reliability. Those remain release blockers. No production configuration changed.

## Dual-model Telegram and explicit same-session route tests (2026-11-06)
- Staging user Telegram messages at 01:26 and 01:27 routed to nvpair/Qwen3-4B (native-model-route reason=local-fits). Stored and retrieved PHOENIX-7316 correctly in the same isolated Telegram session.
- First live !dual call entered the authorized before_dispatch hook, sent a progress notification, ran for 186,824 ms within the hook, then failed with an abort timeout. This attempt did not prove a successful Colab inference, and the intermediate PAIR analysis was not previously delivered.
- Introduced experimental opt-in dualMode.enabled (false by default) for authorized Telegram !dual. Pipeline: direct loopback PAIR preliminary analysis -> direct loopback stage Colab review, with clear source-labeled messages. The PAIR analysis is now delivered before the Colab stage; if Colab fails or times out, users retain the preliminary answer and receive an explicit incomplete warning. This design does NOT import the ordinary OpenClaw Telegram transcript into the direct dual calls, and should not be described as shared durable model memory.
- Added experimental opt-in nativeRouting.forceCommandsEnabled (false by default) to select !pair or !colab inside the existing Telegram session and let users test real cross-provider memory continuity. Forced selections must respect backend eligibility and paid-cloud remains disabled.
- Automated tests: 64 passed after adding partial-delivery and manual-routing cases. Direct live PAIR probe completed in ~6.4 seconds. Live !dual end-to-end success remains pending.
- Staging only: dualMode.enabled=true, forceCommandsEnabled=true, PAIR context profile restored to 11520, Colab staging port 18081, production untouched. NO-GO for production; inference-time HTTP 503 fallback and Colab cold-start timeout are still blockers.
