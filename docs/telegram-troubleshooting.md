# Telegram: `no queued reply payloads` (observed 2026-10-31)

## What we observed
On OpenClaw 2026.10.9, Telegram received a message and the plugin's `before_agent_reply` returned `{handled:true, reply:{text:'...'}}`, but the Gateway logged `visible channel turn dispatched with no queued reply payloads`.

A separate `before_dispatch` hook returned `{handled:true, text:'...'}` and logged `cause=completed:before_dispatch_handled` without queueing a reply. **This is an observation from one installation, not a verified universal OpenClaw bug.**

The built-in `openclaw message send --channel telegram --target <ID> --message 'test'` delivered successfully. Sending using that CLI *inside* the `before_dispatch` handler then delivered a static probe and subsequently a Qwen3/PAIR reply to the same Telegram chat.

## Diagnosis checklist
1. `openclaw plugins inspect smart-router --runtime --json` — confirm `typedHooks` includes `before_dispatch`.
2. Inspect `plugins.entries.smart-router.config.telegramMode`: `off` prevents interception; `prefix` enables it.
3. Note the hook context differs: `before_dispatch` exposes `ctx.channelId === 'telegram'` and `event.content` on the tested build; `before_agent_reply` exposes `ctx.channel` and `event.cleanedBody`.
4. Test direct Telegram delivery with the native OpenClaw CLI before investigating inference.
5. Filter Gateway logs for `smart-router`, `before_dispatch_handled`, `no queued`, `model-fetch`, and `outbound send`.

## Trade-offs
CLI delivery bypasses the usual queued reply path, may not produce equivalent conversation history, and may be slower. In-flight deduplication is not persistent. We welcome test results from other OpenClaw versions and an upstream fix or sanctioned dispatch contract.

Never publish bot tokens, private message bodies, complete configuration, or unredacted server logs.
