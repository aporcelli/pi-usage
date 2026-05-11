# Changelog

All notable changes to `@porche/pi-usage` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-05-11

### Fixed
- Fixed npm installation error (`ETARGET No matching version found`) by updating `@ccusage/pi` dependency requirement to a valid published version (`^18.0.0`).

## [0.1.0] - 2026-05-11

### Added
- **Native `/usage` command** for Pi Coding Agent.
- **Smart Provider Detection**: Automatically infers the active model/provider currently in use via the extension execution context.
- **Live Session Tracking**: Always displays live token usage, cost, and context percentage directly at the top of the command output.
- **Provider Account Limits**: 
  - `openai-codex`: Native OAuth integration to fetch 5h/weekly quotas and reset countdowns.
  - `anthropic`: Native OAuth integration to fetch Claude subscription quota windows.
  - `openrouter`: Integrates credits, total usage, and API key limits.
- **Local Fallback Mode**: Gracefully degrades to `@ccusage/pi` (via `/usage local`) for unsupported providers like `google` (Gemini), displaying historical daily stats.
- **Portable Timezone Support**: Uses `PI_USAGE_TZ`, `TZ`, `Intl`, or `UTC` to properly format reset timestamps irrespective of the host's default timezone.
- **Beautiful TUI Output**: Custom ANSI coloring, terminal progress bars `[████░░░]`, and severity markers (🟢, 🟡, 🔴).

### Fixed
- Fixed critical bug where the extension failed to detect the active provider when executed interactively (idle state) by inspecting Pi's session history as a fallback.
- Fixed TypeScript configuration and plugin types to avoid forcing rigid provider subsets that broke graceful degradation.
- Fixed YAML parsing issues inherited from upstream dependencies by isolating auth resolution strictly to `~/.pi/agent/auth.json`.
