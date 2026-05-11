# Spec — usage-quota-multi-provider

## Scope
Pi package that provides `/usage` command with provider quota view and local usage fallback.

## Functional requirements

### FR-1 Command surface
- `/usage` defaults to `limits` mode.
- `/usage limits [openai-codex|anthropic|openrouter]` shows account quota if available.
- `/usage local` shows local historical usage from Pi session files.

### FR-2 Provider adapters
- Adapter interface must be provider-agnostic.
- V1 adapters:
  - openai-codex
  - anthropic (oauth)
  - openrouter
- Unknown/missing provider must return a clear non-fatal message.

### FR-3 UX output
- Human-readable output (no raw JSON by default).
- Show `left %`, reset time, and countdown.
- Show visual bar + color/status indicator.

### FR-4 Timezone behavior
- Resolve timezone in this order:
  1) `PI_USAGE_TZ`
  2) `TZ`
  3) `Intl` detected timezone
  4) `UTC`
- Must validate timezone and fallback safely.

### FR-5 Portability
- Must run on Linux/macOS/WSL.
- Must not depend on `~/.hermes/auth.json`.
- Auth/config must come from Pi-standard runtime config/env.

### FR-6 Error handling
- Provider unavailable/auth missing/endpoint failure must not crash command.
- Error output must include actionable next step.

## Non-functional requirements
- Command must execute without LLM call.
- Response target <2s on healthy network (excluding provider latency spikes).
- Extension must be package-ready (`pi install npm:...`).

## Acceptance criteria
1. `/usage` works after install + `/reload`.
2. At least one provider adapter returns quota in expected format when properly configured.
3. Missing auth produces friendly setup instructions.
4. Local mode returns parsed/pretty summary.
5. No hardcoded machine-local paths.
