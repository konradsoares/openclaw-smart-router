# Dual evidence review (experimental)

Branch: `feat/dual-evidence-review` (based on PR #5). No production rollout.

## Behavior

The direct Telegram `!dual` path remains PAIR preliminary answer followed by Colab review. The reviewer receives an explicit evidence policy and evidence metadata. This does **not** turn either model into an OpenClaw tool-running agent.

With verification disabled (the default), no evidence network request is made. The Colab reviewer is told that external research was not performed. Do not interpret a model answer or its own claim of having consulted documentation as proof of verification.

With `dualMode.verification.enabled=true`, Smart Router performs a single read-only GET of the PAIR loopback `/v1/models` inventory (4-second timeout). It reports model ID, runtime-advertised context window and status, if available. It does not run commands or fetch external documentation. Inventory is not proof that the model supports a specific context in practice, nor a measurement of memory, throughput or correctness.

Example staging-only plugin configuration:

```json
{
  "dualMode": {
    "enabled": true,
    "background": true,
    "verification": {
      "enabled": true,
      "inventoryUrl": "http://127.0.0.1:8080/v1/models"
    }
  }
}
```

The inventory URL must be HTTP loopback, with exact `/v1/models` path and no credentials, query or fragment. Data from the inventory must be treated as untrusted remote content, not instructions.

## Remaining work

- End-to-end staging Telegram test to evaluate whether critical correction quality improves with evidence metadata.
- Optional tightly allowlisted command verification using approved OpenClaw tools or a paired Windows node; never execute arbitrary shell text supplied by a language model.
- External documentation research through a separately authorized tool with exact source provenance.
- Persist `!dual` transcript in the normal OpenClaw session through a supported API (not raw transcript writes).
- Cold-start/HTTP 503 resilience remains out of scope and NO-GO for production.

## Validation

`npm run check && npm test` — 69 tests passing on Windows Node 22. Tests use mocked PAIR inventory and Colab requests; no live GPU provisioning or Telegram message delivery was attempted.

## Optional llama-server properties

Set `dualMode.verification.serverPropsEnabled=true` to also query the local, uncredentialed HTTP loopback `/props` endpoint, optionally overriding `propsUrl`. Only `GET` is used, with redirects disallowed and a four-second timeout. The plugin forwards an allowlist of fields (context, slots, build, sleeping state, router role). It deliberately drops model paths, chat templates and any additional server metadata.

When llama-server is in router mode, `/props` can report `n_ctx:0` at the router level. This is NOT a usable model context; the module reports it as unknown and keeps separately observed `/v1/models` metadata. The observations are not validation of CLI flags or available GPU memory.

On the connected Windows machine, a read-only probe succeeded on localhost:8080. `/props` identified a router-mode server, build `b11146-7fe450e19`, with router-level n_ctx=0; `/v1/models` returned one model with runtime-advertised n_ctx=11520. These are Windows-local observations only; the Ubuntu Gateway's loopback endpoint may refer to a different service and must be tested independently before staging enablement.

The change remains disabled by default and requires staging review. It does not solve HTTP 503 fallback or Colab cold start.

## Official documentation lookup (experimental)

Optional `dualMode.research.enabled=true` performs a bounded, read-only HTTPS fetch of fixed official documentation endpoints when the user question or PAIR draft mentions Qwen or llama.cpp. This is **not** OpenClaw browser automation or general web search, and no URL supplied by the model or Telegram user is fetched. Sources are Qwen's Hugging Face model card and the upstream llama.cpp server README. A maximum of two documents are requested per dual run, with 7-second request timeouts, redirect refusal, body size limits, and short matching excerpts forwarded to Colab as untrusted data.

The Colab reviewer is instructed to distinguish this retrieved documentation from runtime metadata and model reasoning, and cite only the actual source URLs. If retrieval fails, the system reports the limitation rather than inventing citations. The feature is opt-in and does not change paid cloud authorization or OpenClaw tool permissions.

On 2026-11-06 the Ubuntu smoke test fetched both sources successfully and returned 3 Qwen excerpts and 8 llama-server excerpts without errors. `npm run check` and `npm test` passed (78 tests). General web search and the OpenClaw browser plugin remain unavailable in staging by configuration: `tools.web` is unset and the browser plugin is excluded by `plugins.allow`. This feature is explicitly a constrained first step, not a claim of full browser integration.

## Stage timing and source provenance (2026-11-06)

`runDual()` now emits per-stage durations through its optional `onMetrics` callback, implemented as a privacy-conscious Gateway info log by `createDualHandler`. Fields are `pairMs`, `deliveryMs`, `evidenceMs`, `researchMs`, `colabMs`, `totalMs`, `researchSources`, and `finalStage`. Timing is measured with a monotonic clock. Failures emit partial metrics in the `finally` block, enabling cold-start and timeout analysis even when the Colab request fails. Model inputs, answers, Telegram IDs and tokens are not included in metric logs.

The response includes a router-generated `Official documents retrieved by Smart Router` section containing only successful fixed-source retrieval URLs. This section is a provenance aid, not proof that the model's interpretation of those sources is correct. It also does not filter any unsupported claims inside the model-generated answer. Always treat web excerpts as untrusted data.

Ubuntu validation: `npm run check` and `npm test` passed, 81 tests total. New tests cover timing, exceptions, privacy and filtering of unsuccessful citations. Production remains unchanged. The instrumented staging process must be restarted before observing new timing logs; no inference-time HTTP 503 fallback is claimed fixed.

## Deterministic contradiction checks (2026-11-06)

The optional research output now produces **source-bound structured facts** only when the successful Qwen source excerpt explicitly contains `Context Length: 262,144 natively`, or the successful upstream llama-server README excerpt explicitly contains `--ctx-size`. No facts are inferred from a page title, model assertion, or failed fetch. These facts are included in the Colab review prompt separately from raw source excerpts.

After Colab replies, a deliberately narrow heuristic checks for (1) an explicit incorrect native/max context claim for Qwen3-4B-Instruct-2507, (2) `--n_ctx` presented as a valid server CLI option when documentation confirms `--ctx-size`, and (3) unqualified minimum RAM/VRAM assertions of 16/24 GB. Detected issues are **appended in a clearly attributed Smart Router evidence-check section**; the original Colab response is preserved for auditability. The check does not claim to verify all model output or automatically rewrite prose. In particular, it avoids interpreting a requested *target* of 128K as a statement of the model's native maximum.

Security: only fixed allowlisted retrieved documents may produce these machine-structured facts; source text is treated as data, and no executable action is taken. Deterministic flags can still miss paraphrases or produce false positives, so the check is a guardrail rather than an independent full factual-verification system. No GPU benchmark or RAM sizing has been performed by this feature.

Ubuntu validation: `npm run check` and `npm test` passed (87/87), including reproducing the earlier erroneous Colab response, false-positive rejection for statements saying `--n_ctx` is invalid, missing sources, and avoiding conflation of 128K workload with native context. Production is unchanged.

## Bounded multi-topic source catalog and source attribution (2026-11-06)

Official-document selection is now centralized in `dual-source-catalog.mjs`. It matches the original user question (not the PAIR draft) against a fixed, read-only source catalog: Qwen3-4B, upstream llama-server, Node.js `node:fs` API, and Python `asyncio` API. At most two documents are fetched per turn. This is deliberately *not* general web search, browser automation, or user-controlled URL retrieval. New topics require review and explicit code changes to the catalog.

The downloader rejects redirects, enforces a 7-second timeout per source, and caps both declared length and decompressed text length at 400,000 characters. Extracted excerpts are capped to eight lines, 260 characters each. The additional Node.js documentation was found to have a compressed HTTP Content-Length around 65 KB while its decoded text is around 318 KB; both Node.js and Python sources passed a live Ubuntu smoke test.

`dual-citation-audit.mjs` performs **topic-agnostic provenance checks**, restricted to URLs that the reviewer explicitly labels as sources, references, or documentation. If Colab cites a URL not successfully retrieved in that run, a separate warning states it was *not verified by Smart Router*. Normal illustrative links are not treated as citations. This does not independently verify the factual accuracy of model output, and the older Qwen/llama-specific numerical and CLI checks remain deliberately narrow.

Security notes: no browser plugin was enabled; no production configuration was changed; no paid provider was called during development tests. External excerpts remain untrusted data and are never executed as instructions. Reviewers must not interpret a retrieved URL as proof that a model paraphrase is faithful to it. Ubuntu: `npm run check` and `npm test` passed (95/95); live bounded fetches for Node.js and Python returned 8 and 4 relevant lines respectively.

## Transient 503 recovery (2026-11-06)

The direct Telegram `!dual` flow can opt in to `dualMode.resilience.enabled=true` with `maxRetries=1` (hard maximum 2). This retries only Colab gateway HTTP 502/503/504 after a short 1.5-second bounded delay. It does **not** re-run the PAIR answer, evidence collection or documentation fetch. It never switches to a paid provider. Auth, malformed requests, missing credentials and other non-transient errors fail immediately. Exhausted retry produces an explicit incomplete message, leaving the already delivered PAIR preliminary result visible. Retry notices include only attempt number and delay, never prompt or response data.

This is **not** OpenClaw native model fallback. In particular, the current OpenClaw hook's `fallbacksOverride` behavior and 503 after inference has begun remain separate blockers requiring supported upstream capabilities or additional routing changes. The in-memory background task is still not durable across Gateway restarts. A retry can double the length of a failing call if each upstream request runs to timeout, so keep the feature off in production until staging operational testing. Ubuntu test suite: 100/100 tests passed, including simulated 503 recovery and no re-running PAIR.

## Durable next-turn continuity (experimental, 2026-11-06)

The direct `!dual` hook bypasses the normal OpenClaw agent execution and does **not** append its Q&A to the native transcript. To avoid unsupported direct database/session-file writes, opt-in `dualMode.continuity.enabled=true` uses the supported plugin API `api.session.workflow.enqueueNextTurnInjection` after the Colab result has been delivered. It associates a bounded, historical-data-only summary of the user's question, PAIR draft, and Colab review with the exact `ctx.sessionKey`. It uses a per-message idempotency key and a 24-hour TTL. This context is available to the next native turn, and the host owns persistence and cleanup across restarts.

Limitations: this is a **next-turn memory bridge**, not full native transcript insertion. It requires `ctx.sessionKey` and the OpenClaw session workflow API; the plugin fails closed if either is absent, rather than guessing a Telegram-to-session mapping. A queued injection does not prove the following model run consumed it. A manual Telegram test is still required to demonstrate actual continuity after a gateway restart. No production service or session DB is modified by this feature. The only stored data is a short historical summary owned by OpenClaw's queue; opt-in is off by default.

Colab retry and continuity are independent. No paid API access or arbitrary file writes are introduced. Ubuntu: `npm run check` and `npm test` passed (104 tests).

## Live local 503 recovery smoke (2026-11-06)

Run `node scripts/dual-503-smoke.mjs` in the isolated MacBook worktree. This script uses the real local PAIR server at `127.0.0.1:8080`, but starts a temporary unauthenticated **loopback mock** of the Colab gateway on an ephemeral port. The mock returns HTTP 503 on the first completion request and HTTP 200 on the second. The plugin calls the real authenticated Colab client with a temporary local-only test key; no actual Colab GPU, Telegram messages, production Gateway or paid APIs are accessed. The temporary mock and test key are removed when the script exits.

Observed smoke result: `success=true`, PAIR answered (28 characters), Colab mock was called exactly twice, Colab stage 1,553 ms, total 6,650 ms. This is a genuine local HTTP integration check, **not** a test of OpenClaw's native fallback mechanism or a real cold-start recovery. The native inference-time HTTP 503 recovery gate remains NO-GO until proven separately.
