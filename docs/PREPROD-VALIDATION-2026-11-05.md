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
