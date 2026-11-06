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
