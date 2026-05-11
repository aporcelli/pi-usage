<p align="center">
  <img src="https://pi.dev/logo.svg" alt="Pi Logo" width="80" />
</p>
<h1 align="center">pi-usage</h1>

<p align="center">
  <b>A comprehensive usage and quota tracking extension for the Pi Coding Agent.</b>
</p>

## Overview

`pi-usage` provides a Hermes-like `/usage` command for the [Pi Coding Agent](https://pi.dev). It gives you real-time visibility into your token consumption without spending LLM tokens. 

It automatically detects your active model and displays:
1. **Live Session Usage:** Input, output, and context window utilization for your current session.
2. **Provider Account Limits:** Real-time remaining quota (e.g., 5-hour and weekly limits) for supported APIs.
3. **Local History Fallback:** Historical daily usage tracking via `@ccusage/pi` for providers that do not expose public quota APIs.

## Installation

Install directly from GitHub:

```bash
pi install git:github.com/aporcelli/pi-usage
```

After installation, reload your Pi session:
```text
/reload
```

## Features

### 1. Smart Provider Detection
The extension reads the live execution context in Pi. If you switch models using `/model`, `/usage` will dynamically adapt to query the correct limits for your new provider.

### 2. Multi-Provider Quota Support
- **OpenAI Codex (`openai-codex`)**: Fetches your ChatGPT Plus/Pro 5-hour and weekly window limits.
- **Anthropic (`anthropic`)**: Fetches your Claude Pro usage via the OAuth API.
- **OpenRouter (`openrouter`)**: Fetches your remaining credits and API key spending limits.

*Note: If the active provider does not expose a quota API (like Google Gemini), the extension degrades gracefully and falls back to showing your historical daily local consumption.*

### 3. Pi-Native Authentication
No hardcoded paths or external dependencies. It reads directly from Pi's native credential store (`~/.pi/agent/auth.json`) and gracefully falls back to standard environment variables (`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`).

### 4. Portable Timezone Formatting
Reset countdowns and timestamps are formatted beautifully. It resolves your timezone seamlessly:
1. `PI_USAGE_TZ` environment variable (highest priority)
2. `TZ` environment variable
3. System runtime timezone (`Intl`)
4. UTC (fallback)

## Commands

| Command | Description |
|---|---|
| `/usage` | Show session token usage. Then show account limits for the active provider, or fallback to local daily usage if unsupported. |
| `/usage limits <provider>` | Force query account limits for a specific provider (`openai-codex`, `anthropic`, `openrouter`). |
| `/usage local` | Show daily historical token/cost consumption using `@ccusage/pi`. |

## UI & UX

The output is crafted specifically for Terminal UIs (TUI), featuring:
- **Visual Progress Bars:** `[██████████░░░░] 60%`
- **Traffic Light Indicators:** 🟢 (>70%), 🟡 (30-70%), 🔴 (<30%)
- **Absolute Countdowns:** `(in 2h 15m)`

## Troubleshooting

- **"No limits data" or "Unavailable"**: Ensure you have logged in via `/login` for OAuth providers, or that your API keys are correctly exported.
- **Wrong Reset Timezone**: Export `PI_USAGE_TZ` in your shell (e.g., `export PI_USAGE_TZ=America/Argentina/Buenos_Aires`).
- **"No pude consultar usage local"**: Ensure you have `@ccusage/pi` installed globally (`npm i -g @ccusage/pi`).

## License
MIT
