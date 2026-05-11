# Changelog

All notable changes to `@porche/pi-usage` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.4] - 2026-05-11

### Fixed
- Aligned command behavior with docs: `/usage limits` now only checks the active provider.
- Added explicit validation/warning when users try `/usage limits <provider>`.
- Updated README command reference to match runtime behavior.

## [0.3.3] - 2026-05-11

### Fixed
- Bumped version to 0.3.3 for clean registry publication.

## [0.3.2] - 2026-05-11

### Fixed
- Fixed failed npm publish due to existing version 0.3.1.
- Bumped version to 0.3.2 for clean registry publication.

## [0.3.1] - 2026-05-11

### Changed
- Removed all runtime dependency on external local-usage CLIs.
- `/usage local` now computes usage directly from Pi session files (`~/.pi/agent/sessions`).
- Simplified command surface to: `/usage`, `/usage limits <provider>`, `/usage local`.

### Removed
- Removed third-party dependency from `package.json`.

## [0.1.2] - 2026-05-11

### Fixed
- Fixed GitHub repository and issue tracker URLs in `package.json` to point to the correct user namespace (`aporcelli`).

## [0.1.1] - 2026-05-11

### Fixed
- Fixed npm installation error (`ETARGET No matching version found`) by updating an external dependency requirement to a valid published version.

## [0.1.0] - 2026-05-11

### Added
- **Native `/usage` command** for Pi Coding Agent.
- **Smart Provider Detection**: Automatically infers the active model/provider currently in use via the extension execution context.
- **Live Session Tracking**: Always displays live token usage, cost, and context percentage directly at the top of the command output.
- **Provider Account Limits**: 
  - `openai-codex`: Native OAuth integration to fetch 5h/weekly quotas and reset countdowns.
  - `anthropic`: Native OAuth integration to fetch Claude subscription quota windows.
  - `openrouter`: Integrates credits, total usage, and API key limits.
- **Local Fallback Mode**: Gracefully degrades to local historical stats for unsupported providers like `google` (Gemini).
- **Portable Timezone Support**: Uses `PI_USAGE_TZ`, `TZ`, `Intl`, or `UTC` to properly format reset timestamps irrespective of the host's default timezone.
- **Beautiful TUI Output**: Custom ANSI coloring, terminal progress bars `[████░░░]`, and severity markers (🟢, 🟡, 🔴).

### Fixed
- Fixed critical bug where the extension failed to detect the active provider when executed interactively (idle state) by inspecting Pi's session history as a fallback.
- Fixed TypeScript configuration and plugin types to avoid forcing rigid provider subsets that broke graceful degradation.
- Fixed YAML parsing issues inherited from upstream dependencies by isolating auth resolution strictly to `~/.pi/agent/auth.json`.
