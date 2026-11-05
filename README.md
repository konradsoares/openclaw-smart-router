# OpenClaw Smart Router (community beta)

Opt-in Telegram routing between existing OpenClaw agents: a local inference agent (for example, NVIDIA PAIR with Qwen3), an optional Google Colab inference gateway, and a cloud-backed agent (for example, OpenAI).

**Status:** `0.4.0-beta.3` — community preview. Automated unit tests included. Prefix-free automatic routing is not supported.

## Architecture

```text
Telegram (!route ...)
    → OpenClaw before_dispatch hook
    → Smart Router
       ├─ local: existing OpenClaw agent (pair)
       ├─ cloud: existing OpenClaw agent (main), explicitly authorized
       └─ colab: optional local HTTP gateway → Colab MCP → Ollama / T4
    → openclaw message send
    → Telegram
```

Plain-text requests route to the local agent by default, including multiline prompts within the configured prompt limit. Requests requiring tools are blocked from automatic execution until the user explicitly selects an appropriate route. Local failures do not trigger paid cloud fallback unless `allowCloudFallback` is enabled. An explicitly forced local route never falls back to cloud.

Colab support is optional and independent of the Smart Router installation. When enabled, `!route !colab` sends status updates during slow startup and labels the final response with the backend that actually answered.

## Prerequisites

- Node.js 22+ (Node.js 24 used for local tests).
- An OpenClaw Gateway with a working Telegram channel and an authorized sender.
- An existing local inference agent, such as `pair`, and a cloud-backed agent, such as `main` (agent names are configurable).
- Both agents should work independently before enabling routing.
- NVIDIA PAIR is optional. The plugin invokes configured OpenClaw agents and does not depend on a particular local inference provider.
- **Optional Colab route:** OpenClaw Colab Provisioner with its OpenAI-compatible gateway available on the same host at `127.0.0.1:18080` (or a configured loopback endpoint). Colab is not needed for local or cloud routing.

## Install

Install directly from GitHub (the default branch contains the latest published changes):

```bash
openclaw plugins install \
  git:github.com/konradsoares/openclaw-smart-router@main
```

Alternatively, clone the repository and install locally:

```bash
git clone https://github.com/konradsoares/openclaw-smart-router.git
openclaw plugins install -l ./openclaw-smart-router
```

To install a reproducible release, replace `@main` with an existing Git tag, for example `@v0.4.0-beta.3`. A tag is immutable and may not contain fixes subsequently committed to `main`.

Review the source before accepting the non-ClawHub Git installation warning. Installing the package does **not** necessarily enable the plugin or its Telegram routing: complete the configuration below before testing. Git-installed plugins may display a provenance warning; review the source and permissions rather than assuming that a warning means the plugin is verified. See the [OpenClaw plugin documentation](https://docs.openclaw.ai/plugin).

### Upgrade an existing installation

Back up the OpenClaw configuration and the active plugin before upgrading. Find the active install path using:

```bash
openclaw plugins info smart-router
```

Use the plugin manager to install the published Git revision. Avoid creating a second copy under `~/.openclaw/extensions/` when the active plugin is registered from a Git checkout. For development, test a local checkout before publishing the next version.

## Configuration

Configure the plugin using the OpenClaw CLI after installation.

### 1. Enable the plugin and Telegram routing

**Required on a fresh installation.** The installed plugin may be disabled, and `telegramMode` defaults to `off`. If either is left disabled, `!route` is passed to the normal OpenClaw agent instead of the Smart Router. That agent may use a paid provider.

```bash
openclaw plugins enable smart-router

openclaw config set \
  plugins.entries.smart-router.config.mode \
  '"route"' --strict-json

openclaw config set \
  plugins.entries.smart-router.config.telegramMode \
  '"prefix"' --strict-json

openclaw config set \
  plugins.entries.smart-router.hooks.allowConversationAccess \
  true --strict-json
```

Prefix mode intercepts messages beginning with `!route`. Other messages continue through the normal OpenClaw processing flow.

### 2. Configure Telegram authorization

Add your numeric Telegram user ID to the allowlist:

```bash
openclaw config set \
  plugins.entries.smart-router.config.allowedTelegramIds \
  '["YOUR_TELEGRAM_USER_ID"]' --strict-json
```

Replace `YOUR_TELEGRAM_USER_ID` with your own numeric Telegram user ID, not the bot username. Multiple users can be authorized:

```bash
openclaw config set \
  plugins.entries.smart-router.config.allowedTelegramIds \
  '["USER_ID_1","USER_ID_2"]' --strict-json
```

The allowlist is empty by default. **A fresh installation will not route any Telegram messages until an ID is added.** Only explicitly authorized senders may use the router's Telegram interception.

### 3. Configure local and cloud agents

```bash
openclaw config set \
  plugins.entries.smart-router.config.localAgent '"pair"' --strict-json

openclaw config set \
  plugins.entries.smart-router.config.cloudAgent '"main"' --strict-json
```

- `pair` — local inference using NVIDIA PAIR, llama.cpp, or another configured provider.
- `main` — cloud-backed inference using OpenAI or another cloud provider.

Any existing agent IDs can be used. The Smart Router does not create or reconfigure these agents. Verify agent IDs and model assignments in OpenClaw before testing; an incorrect agent mapping may invoke an unexpected provider.

### 4. Optional routing settings

| Parameter | Default | Description |
|---|---|---|
| `mode` | `route` | `route`, `observe`, or `cloud-only` |
| `telegramMode` | `off` | `off` or `prefix` |
| `telegramPrefix` | `!route` | Telegram routing prefix |
| `localAgent` | `pair` | Local inference agent |
| `cloudAgent` | `main` | Cloud inference agent |
| `localMaxChars` | `800` | Retained compatibility setting; long text does not automatically authorize cloud routing |
| `maxPromptChars` | `1500` | Maximum accepted prompt length |
| `dispatcherTimeoutSeconds` | `45` | Timeout for agent dispatch in seconds |
| `allowedTelegramIds` | `[]` | Authorized Telegram sender IDs |
| `deliveryMethod` | `cli` | Telegram delivery through the OpenClaw CLI |
| `allowCloudFallback` | `false` | Allow a failed automatic local request to retry once using the cloud agent |
| `colabGatewayUrl` | `http://127.0.0.1:18080/v1/chat/completions` | Optional Colab gateway URL (loopback only) |
| `colabEnvFile` | `~/.config/openclaw-colab/gateway.env` | Optional local file containing the gateway API key; if omitted, the default is read by the integration |
| `colabTimeoutSeconds` | `300` | End-to-end timeout for a Colab request |
| `colabFallback` | `pair` | Use the local agent if the Colab request fails; alternatively `none` |
| `colabProgress` | `true` | Send Telegram progress notices for explicit Colab requests |
| `colabProgressDelaySeconds` | `15` | Delay before the additional progress notice |

Example: accept longer prompts (the prompt acceptance limit is separate from local/cloud authorization):

```bash
openclaw config set \
  plugins.entries.smart-router.config.maxPromptChars 3000
```

Example: increase the local agent timeout:

```bash
openclaw config set \
  plugins.entries.smart-router.config.dispatcherTimeoutSeconds 90
```

To prohibit automatic paid cloud fallback:

```bash
openclaw config set \
  plugins.entries.smart-router.config.allowCloudFallback \
  false --strict-json
```

A sample configuration is available in `examples/plugin-config.example.json`.

### 5. Optional: Google Colab route

The Colab Provisioner is installed and managed separately. The Smart Router does not require it for `!route`, `!route !pair`, or `!route !cloud`.

Install and configure the [OpenClaw Colab Provisioner](https://github.com/konradsoares/openclaw-colab-provisioner) **and its separate Autopilot gateway service**, then verify the service. Installing the provisioner plugin alone does not start the HTTP gateway. Alternatively, the Smart Router can use a separately running compatible local gateway without the provisioner plugin:

```bash
systemctl --user is-active openclaw-colab-gateway
```

Configure the route:

```bash
openclaw config set \
  plugins.entries.smart-router.config.colabGatewayUrl \
  '"http://127.0.0.1:18080/v1/chat/completions"' --strict-json

openclaw config set \
  plugins.entries.smart-router.config.colabTimeoutSeconds \
  300 --strict-json

openclaw config set \
  plugins.entries.smart-router.config.colabFallback \
  '"pair"' --strict-json

openclaw config set \
  plugins.entries.smart-router.config.colabProgress \
  true --strict-json
```

The integration reads `COLAB_GATEWAY_API_KEY` from the local gateway environment file by default. Verify that the service is listening on loopback before attempting `!colab`. Do not store Google OAuth credentials in the Smart Router configuration. The gateway endpoint must be bound to loopback; non-loopback addresses are rejected.

When a Colab request arrives, the router sends an immediate status message. If it takes longer than the configured delay, it sends another notice. The final response is labeled `[Colab T4]`, or `[Local / pair]` if the configured fallback ran. Progress messages indicate that the Colab backend is being checked; they do not confirm GPU allocation.

Colab requests are currently text-only and do not implement OpenClaw tool calls, files, images, or streaming. Tool-capable model integration is planned but is not supported in this release.

### 6. Validate, restart and verify (required)

After enabling routing, allowing your Telegram sender ID and configuring agents:

```bash
openclaw config set \
  plugins.entries.smart-router.config.allowCloudFallback \
  false --strict-json

openclaw config validate
openclaw gateway restart

openclaw plugins info smart-router
openclaw config get plugins.entries.smart-router.config
openclaw plugins inspect smart-router --runtime --json
openclaw plugins doctor
```

Before testing, confirm:

- `openclaw plugins info smart-router` shows **Status: enabled** and the expected version.
- `telegramMode` is `prefix`, not `off`.
- `allowedTelegramIds` contains the sender's numeric Telegram user ID, not an empty array.
- `localAgent` points to an existing local agent; `cloudAgent` points to the intended cloud agent.
- `allowCloudFallback` is `false` if automatic paid fallback is not desired.
- Runtime inspection reports the `before_dispatch` hook and `allowConversationAccess: true`.

The `before_model_resolve` hook is observational only and does not override the agents' model selection. Ordinary Telegram messages without `!route` still follow the normal OpenClaw flow.

## Test

Send these commands to your Telegram bot:

**Check initial routing (recommended first test):**

```text
!route !pair Reply exactly: LOCAL ROUTER READY
```

The response should be delivered by the configured local agent. Its exact wording depends on that model; check the logs for the selected agent instead of relying on a fixed output string. If you see an error from your normal/default cloud agent, recheck `telegramMode`, `allowedTelegramIds`, and the plugin enabled state.

**Check automatic local classification:**

```text
!route What is the capital of Ireland?
```

**Force local execution:**

```text
!route !pair What is the capital of Ireland?
```

**Explicitly authorize cloud execution:**

```text
!route !cloud Analyse this complex incident and propose next steps
```

**Test the optional Colab route:**

```text
!route !colab Reply exactly: COLAB ROUTER READY
```

A Colab cold start can take several minutes. The first response may involve GPU assignment, starting Ollama, and downloading a model. If `colabFallback` is `pair`, Colab errors trigger a local retry, not a paid cloud request.

Tool-oriented requests without `!cloud` are blocked by the default cost policy. Prefix-free `!pair`, `!cloud`, and `!colab` commands are not supported.

## Monitor routing activity

On the OpenClaw Gateway host:

```bash
openclaw logs --follow
```

Or, where the OpenClaw Gateway runs as a user service:

```bash
journalctl --user -u openclaw-gateway \
  --since '5 minutes ago' -o cat \
  | grep -Ei 'smart-router|DISPATCH_START|DISPATCH_RESULT|DELIVERY_OK|DELIVERY_FAILED|telegram/send'
```

Successful delivery includes a log entry similar to:

```text
[smart-router] delivered messageId=... agent=pair
[smart-router] delivered messageId=... agent=colab
```

The routed provider may differ depending on the agent and fallback configuration. A handled Telegram turn can produce `visible channel turn dispatched with no queued reply payloads` because the plugin sends the response explicitly through the Telegram CLI.

For the optional Colab gateway:

```bash
journalctl --user -u openclaw-colab-gateway -f
```

To check assigned runtimes without printing access tokens (if the Colab Provisioner project is installed locally):

```bash
unset COLAB_ACCESS_TOKEN
node bin/colabmcp.mjs runtimes | jq '[.runtimes[]? | {name, runtimeSpec}]'
```

Run that last command from the Colab Provisioner project directory.

## Tests

Run the included automated tests from the Smart Router repository:

```bash
npm test
npm run check
```

Unit tests mock OpenClaw CLI interactions, Telegram delivery, and the Colab gateway. They require no GPU, Telegram token, or paid API account. Automated tests do not replace end-to-end Telegram validation.

## Troubleshooting a fresh GitHub installation

| Symptom | What to check |
|---|---|
| `!route` is handled by the default agent (or triggers a cloud/Codex quota error) | `openclaw plugins info smart-router` must show `enabled`; verify `telegramMode: prefix` and a non-empty `allowedTelegramIds` |
| Plugin is enabled but no routed response is delivered | Confirm numeric Telegram sender ID, `allowConversationAccess`, Gateway restart, and `openclaw logs --follow` |
| `!route !pair` fails | Test the configured `localAgent` independently; the plugin does not install a local model |
| `!route !colab` times out or falls back | Check `systemctl --user status openclaw-colab-gateway` and its journal; a cold T4 startup may be slow |
| `provenance-invalid` warning | Git source provenance is not verified by the plugin registry; inspect the installed source and permissions |
| Config validation rejects a new setting | Confirm the installed plugin version and its `configSchema` using `openclaw plugins inspect smart-router --runtime --json` |

## Known limitations

- Explicit `!route` prefix required; prefix-free automatic routing is not released.
- Each routed run uses an independent session ID; conversation continuity is not implemented.
- In-memory deduplication only; no replay protection after restart.
- The plugin performs synchronous subprocess-driven routing within `before_dispatch` and may encounter OpenClaw execution timeouts, especially during a Colab cold start.
- Explicit outbound Telegram delivery operates separately from standard queued reply/history handling.
- The authorization allowlist defaults to empty; ordinary messages continue through normal OpenClaw processing.
- The `--message` argument may be visible to other trusted local processes in process listings. Secure your Gateway host.
- `!colab` supports text chat only. OpenClaw tool calling, images, file operations, and streaming are not available through this route yet.
- Colab compute units may be consumed while a GPU runtime is allocated. The Colab Provisioner manages its own runtime lifecycle; stopping the router does not shut down the GPU.
- Git-installed plugins may show `provenance-invalid` until the OpenClaw package provenance can be verified.

See [Telegram troubleshooting](docs/telegram-troubleshooting.md) and [security considerations](docs/security.md).

## Contributing

Open an issue with sanitized OpenClaw version, hook metadata, and reproducible logs. Never upload a full `openclaw.json`, credentials, message contents, or personal chat identifiers. Pull requests with alternative providers, mocked integration tests, and upstream-hook compatibility fixes are welcome.

## License

MIT. Community project; not affiliated with NVIDIA, Google, OpenAI, or the OpenClaw maintainers.

### Telegram session continuity (staging change)

For routed local/cloud CLI calls, the router now derives a stable opaque session identifier from the Telegram target. This preserves repeated requests to the **same OpenClaw agent** across messages. Separate agents may still have independent session stores, and the direct Colab HTTP route still needs explicit history propagation; cross-backend memory is not yet solved.
