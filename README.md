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

Install directly from GitHub after the desired version has been published:

```bash
openclaw plugins install \
  git:github.com/konradsoares/openclaw-smart-router@main
```

Alternatively, clone the repository and install locally:

```bash
git clone https://github.com/konradsoares/openclaw-smart-router.git
openclaw plugins install -l ./openclaw-smart-router
```

To pin a published beta release, replace `@main` with its Git tag, such as `@v0.4.0-beta.3`, once available in the repository.

Review the source before granting permissions. Local/Git plugin installs may require explicit installation-policy confirmation. See the [OpenClaw plugin documentation](https://docs.openclaw.ai/plugin).

### Upgrade an existing installation

Back up the OpenClaw configuration and the active plugin before upgrading. Find the active install path using:

```bash
openclaw plugins info smart-router
```

Use the plugin manager to install the published Git revision. Avoid creating a second copy under `~/.openclaw/extensions/` when the active plugin is registered from a Git checkout. For development, test a local checkout before publishing the next version.

## Configuration

Configure the plugin using the OpenClaw CLI after installation.

### 1. Enable routing

```bash
openclaw config set \
  plugins.entries.smart-router.config.mode route

openclaw config set \
  plugins.entries.smart-router.config.telegramMode prefix

openclaw config set \
  plugins.entries.smart-router.hooks.allowConversationAccess true
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

The allowlist is empty by default. Only explicitly authorized senders may use the router's Telegram interception.

### 3. Configure local and cloud agents

```bash
openclaw config set \
  plugins.entries.smart-router.config.localAgent pair

openclaw config set \
  plugins.entries.smart-router.config.cloudAgent main
```

- `pair` — local inference using NVIDIA PAIR, llama.cpp, or another configured provider.
- `main` — cloud-backed inference using OpenAI or another cloud provider.

Any existing agent IDs can be used. The Smart Router does not create or reconfigure these agents.

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

Install and configure the [OpenClaw Colab Provisioner](https://github.com/konradsoares/openclaw-colab-provisioner), then verify its gateway service:

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

The integration reads `COLAB_GATEWAY_API_KEY` from the local gateway environment file by default. Do not store Google OAuth credentials in the Smart Router configuration. The gateway endpoint must be bound to loopback; non-loopback addresses are rejected.

When a Colab request arrives, the router sends an immediate status message. If it takes longer than the configured delay, it sends another notice. The final response is labeled `[Colab T4]`, or `[Local / pair]` if the configured fallback ran. Progress messages indicate that the Colab backend is being checked; they do not confirm GPU allocation.

Colab requests are currently text-only and do not implement OpenClaw tool calls, files, images, or streaming. Tool-capable model integration is planned but is not supported in this release.

### 6. Verify configuration

```bash
openclaw config get plugins.entries.smart-router
openclaw plugins info smart-router
openclaw plugins inspect smart-router --runtime --json
openclaw plugins doctor
openclaw config validate
```

Restart the OpenClaw Gateway if needed:

```bash
openclaw gateway restart
```

The Smart Router should be enabled with `before_dispatch` available. The `before_model_resolve` hook is observational only and does not override the agents' model selection.

## Test

Send these commands to your Telegram bot:

**Check message delivery:**

```text
!route delivery probe
```

Expected response:

```text
SMART ROUTER DELIVERY OK
```

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

To check assigned runtimes without printing access tokens:

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
