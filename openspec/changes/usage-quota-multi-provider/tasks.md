# Tasks — usage-quota-multi-provider

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 350-600 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR1 skeleton+core, PR2 adapters, PR3 docs+tests |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

## Work units

### PR1 — package skeleton + core utilities
- [ ] Create package scaffold (`package.json`, `README.md`, `extensions/usage-command.ts`, `src/core/*`).
- [ ] Implement timezone resolver and reset formatting (portable fallback chain).
- [ ] Implement renderer for bars/status/left%.
- [ ] Add unit tests for timezone/format logic.

### PR2 — provider adapters + limits mode
- [ ] Implement adapter interface and registry.
- [ ] Implement OpenAI Codex adapter (runtime/env-based auth only).
- [ ] Implement Anthropic OAuth adapter.
- [ ] Implement OpenRouter adapter.
- [ ] Add adapter tests (happy path + auth-missing + schema-missing).

### PR3 — local mode + docs + hardening
- [ ] Implement `local` mode parser from `@ccusage/pi`.
- [ ] Add robust error messaging and provider setup hints.
- [ ] Final README: install, config, compatibility matrix, troubleshooting.
- [ ] Add smoke test checklist for Linux/macOS/WSL.
