# Security notes

- Keep Telegram's own access policy restrictive; add numeric Telegram user/chat IDs to `allowedTelegramIds`.
- An empty allowlist does **not** enable interception. This is intentional.
- The plugin only intercepts direct Telegram messages starting with `!route`; groups and other channels are ignored.
- The plugin uses `spawn` with explicit argument arrays (no shell interpolation), but model prompts can still cause unsafe behavior if an agent has privileged tools.
- `main` may have side-effecting tools; the router never retries failed main runs.
- A local agent may have OpenAI fallback *within its own configuration*. This package does not prevent that.
- Responses are sent through OpenClaw's Telegram CLI and may bypass regular history/queue semantics.
- Durable deduplication, robust cancellation, session continuity and delivery receipts are not yet implemented. Do not deploy as unattended production infrastructure.
- Protect the plugin code and your OpenClaw configuration files. Never commit API keys, cookies or Telegram tokens.
