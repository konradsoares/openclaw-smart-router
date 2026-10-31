OpenClaw Smart Router (community beta)

Opt-in Telegram routing between an existing local OpenClaw agent (e.g. NVIDIA PAIR + Qwen3) and a cloud-backed OpenClaw agent (e.g. OpenAI).

Status: 0.3.2-beta.1 — community preview. Automated unit tests included. Automatic prefix-free routing is not yet supported.

Architecture

Telegram (!route ...) → before_dispatch → classify → openclaw agent (pair/main) → openclaw message send → Telegram

Short, tool-free messages route to the local agent. Messages with tool intent, multiple lines, or over the configured character limit route to the cloud agent. Local failures fall back to cloud unless a local route is explicitly forced; no automatic retries of cloud actions.

Prerequisites

Node.js 22+ (Node 24 tested for syntax and unit tests)

OpenClaw Gateway with a working Telegram provider and permitted sender

An existing pair agent configured for local inference and a main agent configured for cloud inference (names configurable)

Both agents must work independently before enabling the plugin

NVIDIA PAIR is optional: it serves as an OpenAI-compatible inference provider, but the plugin just calls the configured OpenClaw agent.

Install

Install directly from GitHub:

openclaw plugins install \
  git:github.com/konradsoares/openclaw-smart-router@main

Alternatively, clone the repository and install locally:

git clone https://github.com/konradsoares/openclaw-smart-router.git
openclaw plugins install -l ./openclaw-smart-router

Review the plugin source before granting permissions. Local/Git plugin installs may require explicit installation-policy confirmation.

See official installation documentation.

Configuration

After installation, configure the plugin using the OpenClaw CLI.

1. Enable routing

openclaw config set \
  plugins.entries.smart-router.config.mode route

openclaw config set \
  plugins.entries.smart-router.config.telegramMode prefix

openclaw config set \
  plugins.entries.smart-router.hooks.allowConversationAccess true

The prefix mode intercepts messages beginning with !route. Other messages continue through the normal OpenClaw processing flow.

2. Configure Telegram authorization

Add your numeric Telegram user ID to the allowlist:

openclaw config set \
  plugins.entries.smart-router.config.allowedTelegramIds \
  '["YOUR_TELEGRAM_USER_ID"]'

Replace YOUR_TELEGRAM_USER_ID with your actual numeric Telegram user ID, not your bot username.

Multiple users can be authorized:

openclaw config set \
  plugins.entries.smart-router.config.allowedTelegramIds \
  '["USER_ID_1","USER_ID_2"]'

Security: The allowlist is empty by default. Only explicitly authorized users can use the plugin's routing functionality.

3. Configure local and cloud agents

Specify the OpenClaw agents that will process requests:

openclaw config set \
  plugins.entries.smart-router.config.localAgent pair

openclaw config set \
  plugins.entries.smart-router.config.cloudAgent main

In this example:

pair — local inference agent using NVIDIA PAIR, llama.cpp, or another configured local provider

main — cloud-backed agent using OpenAI or another cloud provider

You can use different agent names according to your existing OpenClaw configuration.

4. Optional routing settings

The plugin supports additional parameters:

Parameter

Default

Description

mode

route

route, observe, or cloud-only

telegramMode

off

off or prefix

telegramPrefix

!route

Prefix used for Telegram routing

localAgent

pair

Local inference agent

cloudAgent

main

Cloud inference agent

localMaxChars

800

Maximum message length for local routing

maxPromptChars

1500

Maximum accepted prompt length

dispatcherTimeoutSeconds

45

Dispatcher timeout

allowedTelegramIds

[]

Authorized Telegram sender IDs

deliveryMethod

cli

Telegram delivery using OpenClaw CLI

Example: allow longer messages to be routed locally:

openclaw config set \
  plugins.entries.smart-router.config.localMaxChars 1200

Example: increase dispatcher timeout:

openclaw config set \
  plugins.entries.smart-router.config.dispatcherTimeoutSeconds 90

A sample configuration is also available in examples/plugin-config.example.json.

5. Verify configuration

Inspect the current plugin settings:

openclaw config get plugins.entries.smart-router

Check plugin activation:

openclaw plugins inspect smart-router --runtime --json

Run plugin diagnostics:

openclaw plugins doctor

Restart the Gateway if required:

systemctl --user restart openclaw-gateway

The plugin should appear as enabled, loaded, and activated, with the before_dispatch and before_model_resolve hooks registered.

Test

Send these commands to your Telegram bot:

Test message delivery:

!route delivery probe

Expected response:

SMART ROUTER V032 DELIVERY OK

Test automatic local/cloud classification:

!route What is the capital of Ireland?

Force cloud execution:

!route !cloud Analyse this complex incident and propose next steps

Force local execution:

!route !pair What is the capital of Ireland?

!route !pair forces local execution, while !route !cloud forces cloud execution.

Prefix-free !pair and !cloud commands are not supported in this beta.

Monitor routing activity

On the Gateway host:

journalctl --user -u openclaw-gateway \
  --since "5 minutes ago" -o cat \
  | grep -Ei \
  'smart-router|DISPATCH_START|DISPATCH_RESULT|DELIVERY_OK|DELIVERY_FAILED|model-fetch|outbound send'

Successful routing should produce entries such as:

[smart-router] DISPATCH_START ...
[model-fetch] provider=nvpair status=200
[smart-router] DISPATCH_RESULT agent=pair ok=true
[smart-router] DELIVERY_OK ...

The provider name may differ depending on your local inference configuration.

Tests

Run the included automated tests:

npm test
npm run check

Unit tests mock the OpenClaw CLI and require no GPU, Telegram token, or paid API account.

Known limitations

Explicit !route prefix required; automatic routing is not released.

Each run uses an independent session ID; no conversation continuity.

In-memory deduplication only; no replay protection after restart.

Plugin performs synchronous subprocess-driven routing within before_dispatch and may encounter Gateway execution timeouts.

Explicit outbound Telegram delivery operates separately from standard queued reply/history handling.

Authorization allowlist defaults to empty; standard messages continue to the normal OpenClaw flow.

--message may be visible to other trusted local processes in process listings; secure your Gateway host.

See [Telegram troubleshooting](docs/telegram-troubleshooting.md) and [security considerations](docs/security.md).

## Contributing

Open an issue with sanitized OpenClaw version, hook metadata and reproducible logs. Never upload full `openclaw.json`, credentials, message contents or personal chat identifiers. Pull requests with alternative providers, mocked integration tests and upstream-hook compatibility fixes are welcome.

## License

MIT. Community project; not affiliated with NVIDIA, OpenAI or the OpenClaw maintainers.
