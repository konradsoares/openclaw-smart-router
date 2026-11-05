# Native token-aware routing (experimental)

All operational Telegram status, progress, fallback and error messages are English by default. Normal agent answers are instructed to use the language of the latest user message unless the user asks otherwise.

In telegramMode=prefix, explicit !route commands keep their existing dispatch paths. Direct Colab calls have a separate process-local history. In telegramMode=native and nativeRouting.enabled=true, ordinary Telegram turns stay in one OpenClaw-managed session; before_model_resolve returns model/provider/fallback overrides. These two modes are NOT equivalent; the latter is the proposed shared-session architecture. Native mode is disabled by default and requires an isolated integration test before production.

PAIR supplies aggregated model inventory through http://127.0.0.1:8080/v1/models. The router caches it 15 seconds and only selects listed models. Effective context is the minimum of PAIR-advertised meta.n_ctx and configured contextWindow. Configure this manually to the lowest context among nodes hosting a model: the aggregated endpoint does not expose per-node context limits. PAIR chooses the node; it does not combine node memory.

Budget: estimate prompt tokens, previous history (captured best-effort from prior prompt-build hooks), system instructions, tool overhead when needed, output reserve, and safety margin. Token estimation is approximate and not a tokenizer. The first turn of a preexisting session uses an unknown-history reserve. Exact limits require provider/model tokenizers and runtime checks.

Fallback local -> Colab -> cloud is valid only for configured OpenClaw providers/models whose effective context fits. The Colab Gateway is NOT automatically registered as an OpenClaw provider. Leave nativeRouting.colabModel empty until provider registration and compatibility are validated. Colab context defaults to 4096 until configured otherwise. Paid cloud fallback requires BOTH allowCloudFallback=true and nativeRouting.allowPaidCloud=true, otherwise the router must fail closed if no free backend fits.

Example plugin settings (not automatically installed):

    telegramMode: native
    replyInUserLanguage: true
    allowCloudFallback: false
    nativeRouting:
      enabled: true
      pairModelsUrl: http://127.0.0.1:8080/v1/models
      localModels:
        - model: nvpair/unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_K_M
          contextWindow: 11520
          maxOutputTokens: 2048
          supportsTools: false
      colabModel: ""
      colabContextWindow: 4096
      colabMaxOutputTokens: 1024
      cloudModel: openai/gpt-6-astra
      allowPaidCloud: false
      systemTokens: 1600
      unknownHistoryTokens: 1024
      toolTokens: 2000
      safetyFraction: 0.15

The example above does not enable paid fallback or native Colab routing. Tool-capable tasks require explicit supportsTools in the selected local model profile; model routing does not change OpenClaw tool authorization.

Before enabling production: register Colab as a normal provider in isolated staging; validate tool compatibility; test same-session local-to-Colab and Colab-to-cloud model changes, short/long history, GPU disappearance, multilingual replies, gateway restart and complete rollback. No live cross-provider continuity has yet been validated.
