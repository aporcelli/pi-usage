# Apply Progress — usage-quota-multi-provider

## Completed
- Created package scaffold:
  - `package.json`
  - `README.md`
  - `extensions/usage-command.ts`
- Implemented `/usage` command modes:
  - `limits` (default)
  - provider explicit: codex/anthropic/openrouter
  - local usage modes: daily/weekly/monthly
- Implemented Pi-native auth resolution from `~/.pi/agent/auth.json`.
- Added timezone portability resolver (`PI_USAGE_TZ -> TZ -> Intl -> UTC`).
- Added human-readable output with visual bars and left%/reset formatting.

## Files changed
- `package.json`
- `README.md`
- `extensions/usage-command.ts`

## Verification
- Static validation only in this pass (no test harness yet).
- Requires runtime verification in Pi session via `/reload` and `/usage`.

## Risks / known gaps
- Anthropic limits endpoint may not return plan windows for all auth modes.
- Codex refresh flow uses public OAuth refresh endpoint and may need hardening/retry policy.
- OpenRouter key/credits schema may vary by account tier.

## Remaining
- Add tests (timezone/format/adapters with mocked payloads).
- Split into chained PR strategy from `tasks.md`.
- Add npm publishing metadata and CI checks.
