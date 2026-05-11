# Design — usage-quota-multi-provider

## Orchestration (SDD + subagent roles)
Parent orchestrator controls phases and guardrails; specialist roles are delegated conceptually:
- Explorer role: provider endpoint/auth discovery
- Implementer role: extension command + adapter framework
- Reviewer role: compatibility and failure-mode checks

## Architecture

### 1) Extension entrypoint
- `extensions/usage-command.ts`
- Registers `/usage` command and argument completions.

### 2) Core modules
- `src/core/timezone.ts`
  - timezone resolution + validation
  - reset/counter formatting
- `src/core/render.ts`
  - bars, status thresholds, textual templates
- `src/core/types.ts`
  - normalized quota models

### 3) Adapter interface
```ts
interface UsageAdapter {
  id: "openai-codex" | "anthropic" | "openrouter";
  canHandle(ctx: RuntimeContext): boolean;
  fetchLimits(ctx: RuntimeContext): Promise<QuotaSnapshot>;
}
```

### 4) Adapters
- `src/adapters/openai-codex.ts`
- `src/adapters/anthropic.ts`
- `src/adapters/openrouter.ts`

Each adapter returns normalized:
```ts
type QuotaWindow = { label: string; leftPercent: number; resetAt?: Date; resetInSeconds?: number };
type QuotaSnapshot = { provider: string; plan?: string; account?: string; windows: QuotaWindow[]; details?: string[] };
```

### 5) Local usage backend
- `src/local/ccusage.ts`
- Runs `ccusage-pi`/`npx @ccusage/pi` and parses JSON into normalized local stats.

## Config strategy
- Read Pi settings from `~/.pi/agent/settings.json` only for provider hint.
- Read auth only from provider-appropriate env/runtime inputs (no Hermes path dependency).
- Optional overrides:
  - `PI_USAGE_TZ`
  - provider-specific endpoint overrides (documented)

## Failure modes
- Missing creds => `Unavailable` block + setup steps.
- API schema drift => adapter-specific parser guards + safe fallback message.
- Network failures => timeout + concise retry hint.

## Files
- `package.json`
- `README.md`
- `extensions/usage-command.ts`
- `src/**`
- `tests/**`
