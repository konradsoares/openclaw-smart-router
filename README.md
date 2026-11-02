# OpenClaw Smart Router

Telegram command routing for OpenClaw. Send short prompts to an existing local agent, send explicit requests to a Google Colab T4 gateway, or use a cloud agent. Colab is provisioned on demand by the separate [OpenClaw Colab Provisioner](https://github.com/konradsoares/openclaw-colab-provisioner).

**Version:** 0.4.0-beta.3 · **Requirements:** Node.js 22+, OpenClaw 2026.10.9, a configured Telegram channel. For Colab: a running Colab Provisioner v1.3.0-beta.3 gateway.

## Commands

| Telegram message | Destination |
|---|---|
| `!route Hello` | Local agent for short plain-text prompts; cloud agent for tool-oriented prompts |
| `!route !pair Hello` | Existing local agent (`pair`) |
| `!route !cloud Hello` | Existing cloud agent (`main`) |
| `!route !colab Hello` | Colab T4 through `127.0.0.1:18080` |

Explicit `!colab` requests send an immediate Telegram status message, another update if the response takes longer than the configured delay, and label the final answer `[Colab T4]` (or `[Local / pair]` after fallback). These messages do not claim that a GPU was created unless the provisioner confirms it. The Smart Router works without the Colab Provisioner installed: only `!colab` requests need its local gateway.

`!colab` is text chat only. It does not support web browsing, file operations, tool calling, images, or streaming. Keep tool-oriented work on the cloud agent.

## Installation

Back up the existing configuration and installed plugin before upgrading. Extract this release, then update the installed Smart Router using your existing plugin installation method. If the plugin was installed from GitHub, commit/push the release to its repository and reinstall/update from that source. Do not edit the local OpenClaw config with untrusted content.

```bash
npm test
npm run check
openclaw plugins doctor
```

Configure the Smart Router plugin in `~/.openclaw/openclaw.json` (retain your existing allowlist IDs):

```json
{
  "telegramMode": "prefix",
  "telegramPrefix": "!route",
  "localAgent": "pair",
  "cloudAgent": "main",
  "colabGatewayUrl": "http://127.0.0.1:18080/v1/chat/completions",
  "colabTimeoutSeconds": 300,
  "colabFallback": "pair",
  "colabProgress": true,
  "colabProgressDelaySeconds": 15,
  "allowCloudFallback": false,
  "allowedTelegramIds": ["YOUR_TELEGRAM_USER_ID"]
}
```

These are **plugin settings**, not the complete OpenClaw configuration. Keep any existing `mode`, `hooks.allowConversationAccess`, and channel settings.

The API key is read from `~/.config/openclaw-colab/gateway.env`. It is not copied into the plugin config. The OpenClaw process must have read access to the file. Alternatively set `colabEnvFile` to a different local path containing `COLAB_GATEWAY_API_KEY=...`.

```bash
chmod 700 ~/.config/openclaw-colab
chmod 600 ~/.config/openclaw-colab/gateway.env
openclaw config validate
openclaw gateway restart
```

## Colab Provisioner

Install and enable the Colab Provisioner separately. Its systemd service must be running on the same Ubuntu host as OpenClaw:

```bash
systemctl --user is-active openclaw-colab-gateway
```

The first `!route !colab` request provisions a T4, creates a Jupyter session, installs/starts Ollama and downloads the configured model. The first response may take several minutes. Repeated requests reuse the loaded model. The provisioner frees its owned runtime after its configured idle interval.

Keep the gateway bound to `127.0.0.1`. The Smart Router refuses non-loopback gateway URLs. It never directly handles Google OAuth credentials.

## Validation

1. Send `!route delivery probe` and confirm Telegram delivery.
2. Send `!route !pair Reply PAIR READY` and confirm the existing local agent works.
3. Send `!route !colab Reply COLAB READY` and inspect both services' logs.
4. Verify no runtime is left allocated after the idle interval:

```bash
journalctl --user -u openclaw-colab-gateway --since '1 hour ago' --no-pager | grep -Ei 'Released owned|Cleared stale|Idle cleanup failed'
cd ~/Documents/Projects/openclaw-colab-provisioner
unset COLAB_ACCESS_TOKEN
node bin/colabmcp.mjs runtimes | jq '[.runtimes[]? | {name, accelerator:.runtimeSpec.accelerator}]'
```

The list may be empty because the runtime was deleted by Colab independently. For confirmation of **Autopilot's own deletion**, look for `Released owned Colab runtime ...` in the logs. A stale-state cleanup is not proof of deliberate shutdown.

## Operational limits

- `colabFallback: "pair"` falls back to the local agent when the Colab request fails; `"none"` sends a failure response. Forced `!colab` never falls back to the paid cloud by default.
- `colabTimeoutSeconds` covers the full cold-start request. Telegram/platform timeouts may be shorter. The first inference can fail even if provisioning continues; retry only after inspecting the runtime list to avoid unnecessary allocations.
- Chat messages sent directly to Colab are independent requests with no conversation memory. Persistent conversation state and tool calling are not implemented in this version.
- Colab compute units may be consumed while a runtime is allocated. Stopping the Ubuntu gateway does not automatically delete the remote GPU.

## Testing

```bash
npm test
npm run check
```

## Routing and cost policy

Automatic routing uses the local `pair` agent for text requests, including multiline and long prompts. Requests identified as requiring tools are blocked until explicitly sent with `!route !cloud`. Cloud fallback is disabled unless `allowCloudFallback: true` is explicitly configured. `!route !pair` never falls back. `!route !colab` falls back only to `pair` when configured with `colabFallback: "pair"`.

## Clean GitHub installation

The Colab Provisioner is optional. Only the Smart Router plugin and an existing OpenClaw local agent are required for local routing. To reinstall a published version from GitHub:

```bash
openclaw plugins info smart-router
openclaw plugins --help
```

Back up `~/.openclaw/openclaw.json`, and use `openclaw plugins uninstall smart-router` **only if** the installed CLI help confirms that command. Then install the published Git ref:

```bash
openclaw plugins install git:github.com/konradsoares/openclaw-smart-router@v0.4.0-beta.3
openclaw config validate
openclaw plugins info smart-router
```

The Git tag must exist upstream before the install command will succeed. Never delete `~/.openclaw` or the agent configuration to update a plugin. The optional Colab Provisioner is installed and managed separately.

### Telegram progress settings

- `colabProgress` (default `true`): send a status message immediately and one delayed status update for a pending `!colab` request.
- `colabProgressDelaySeconds` (default `15`): delay before the second status update, minimum 5 seconds.
- Final replies identify the actual successful backend (`Colab T4` or `Local / pair`).
- When the Colab gateway is not installed or unreachable, `colabFallback: "pair"` uses the configured local agent; `"none"` reports a failure. Never silently route an explicit Colab request to paid cloud.
- `allowCloudFallback` defaults to `false` and is only used for automatic local dispatch failures.
