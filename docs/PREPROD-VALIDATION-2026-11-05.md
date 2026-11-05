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
