# OpenClaw Smart Router (community beta)

**Opt-in Telegram routing between an existing local OpenClaw agent (e.g. NVIDIA PAIR + Qwen3) and a cloud-backed OpenClaw agent (e.g. OpenAI).**

> **Status:** `0.3.2-beta.1` — community preview. Built from a working OpenClaw 2026.10.9 troubleshooting setup; the GitHub bundle itself has automated unit tests but has **not** been independently end-to-end tested on every OpenClaw release. No automatic prefix-free routing yet.

## Architecture

`Telegram (!route ...) → before_dispatch → classify → openclaw agent (pair/main) → openclaw message send → Telegram`

Short, tool-free messages route to the local agent. Messages with tool intent, multiple lines or over the configured character limit route to the cloud agent. Local failures fall back to cloud unless a local route is explicitly forced; no automatic retries of cloud actions.

## Prerequisites

- Node.js 22+ (Node 24 tested for syntax and unit tests)
- OpenClaw Gateway with working Telegram provider and permitted sender
- An existing `pair` agent configured for local inference and a `main` agent configured for cloud inference (names configurable)
- Both agents must work independently before enabling the plugin

NVIDIA PAIR is optional: it serves as an OpenAI-compatible inference provider, but the plugin just calls the configured OpenClaw agent.

## Install

Download/clone the repository onto the Gateway machine:

```bash
openclaw plugins install -l ./openclaw-smart-router
# For a published remote repo:
# openclaw plugins install git:github.com/OWNER/openclaw-smart-router@v0.3.2-beta.1
```

Review the plugin source before granting permissions. Local/Git plugin installs may require explicit installation-policy confirmation. See [official install docs](https://docs.openclaw.ai/cli/plugins/install).

### Configure (merge into existing OpenClaw configuration)

See [`examples/plugin-config.example.json`](examples/plugin-config.example.json). Set `allowedTelegramIds` to your numeric Telegram sender ID. The configuration file is an **example snippet**, not a replacement for your full `openclaw.json`.

Set in OpenClaw's plugin entry:

- `hooks.allowConversationAccess: true`
- `config.telegramMode: "prefix"` (default `off`)
- `config.allowedTelegramIds: ["YOUR_NUMERIC_TELEGRAM_USER_ID"]`
- `config.localAgent: "pair"` and `config.cloudAgent: "main"`

Restart the Gateway and check: `openclaw plugins inspect smart-router --runtime --json`.

## Test

```text
!route delivery probe
!route What is the capital of Ireland?
!route !cloud Analyse this complex incident and propose next steps
!route !pair What is the capital of Ireland?
```

`!route !pair` forces local, `!route !cloud` forces cloud. Prefix-free `!pair` and `!cloud` are **not** supported in this beta.

```bash
journalctl --user -u openclaw-gateway --since '5 minutes ago' -o cat | grep -Ei 'smart-router|no queued|model-fetch|outbound send'
```

## Tests

```bash
npm test
npm run check
```

Unit tests mock the OpenClaw CLI and require no GPU, Telegram token or paid API account.

## Known limitations

- Explicit `!route` prefix required; automatic routing is not released.
- Each run uses an independent session ID; no conversation continuity.
- In-memory deduplication only, no replay protection after restart.
- Plugin performs synchronous subprocess-driven routing within `before_dispatch` and may encounter Gateway execution timeouts.
- Explicit outbound Telegram delivery bypasses standard queued reply/history behavior on the affected installation.
- Authorization allowlist defaults to empty; standard messages continue to the normal OpenClaw flow.
- `--message` may be visible to other trusted local processes in process listings; secure your Gateway host.

See [Telegram troubleshooting](docs/telegram-troubleshooting.md) and [security considerations](docs/security.md).

## Contributing

Open an issue with sanitized OpenClaw version, hook metadata and reproducible logs. Never upload full `openclaw.json`, credentials, message contents or personal chat identifiers. Pull requests with alternative providers, mocked integration tests and upstream-hook compatibility fixes are welcome.

## License

MIT. Community project; not affiliated with NVIDIA, OpenAI or the OpenClaw maintainers.
