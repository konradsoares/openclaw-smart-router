# Changelog

## Unreleased

### Staging (native routing vNext)
- Default Telegram operational/progress messages in English while normal Colab/OpenClaw replies follow the language of the latest user prompt.
- Add experimental token-budget-aware PAIR model selection with dynamic local inventory and conservative context limits.
- Add a disabled-by-default native OpenClaw model override hook, preserving the session for model changes when supported.
- Add explicit Colab registration requirement and two-part paid-cloud fallback permission gate.
- Native routing is unverified across live providers; retain existing production behavior until staging integration proves it.


### Added
- Telegram progress distinguishes existing and new Colab runtimes using authenticated read-only status probes; generic fallback when status is unavailable.

- Use stable opaque Telegram conversation identifiers for routed OpenClaw CLI sessions.
- Add regression tests for same-conversation reuse and conversation isolation.
- Cross-agent and direct Colab history continuity remain pending.

## v0.4.0-beta.3
- Previous tagged release; preserved in Git history.
