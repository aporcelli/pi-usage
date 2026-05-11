<p align="center">
  <img src="pi-usage-logo.svg" alt="Pi Usage" width="600" />
</p>
<p align="center">
  <b>A comprehensive usage and quota tracking extension for the Pi Coding Agent.</b>
</p>

## Overview

`pi-usage` brings a native, Hermes-style `/usage` command to the [Pi Coding Agent](https://pi.dev). 
It provides complete visibility into your token consumption without spending LLM tokens to query it.

Every time you run `/usage`, it displays:
1. **Live Session Token Usage:** The exact tokens (input, output, and context window percentage) spent in your current active session.
2. **Provider Account Limits:** The real-time remaining quota from your active provider's API (e.g., ChatGPT Plus 5-hour limits, OpenRouter credits).
3. **Graceful Fallback:** If your active provider (like Google Gemini) does not expose a public quota API, it automatically falls back to local historical usage computed directly from your Pi session files.

## Installation

Install directly from GitHub into your Pi environment:
```bash
pi install git:github.com/aporcelli/pi-usage
```

After installation, reload your Pi session:
```text
/reload
```

## Commands

- **/usage**
  Detects your active provider and displays current session token usage, plus provider-specific API limits (or a local usage summary if the provider is unsupported).

- **/usage <provider>**
  Forcefully checks API limits for a specific provider.
  - Supported providers: `openai-codex`, `anthropic`, `openrouter`.

- **/usage local**
  Bypasses provider APIs completely and calculates historical token usage (24h, 7d, 30d) directly from your Pi session files.

## How It Works Under the Hood

### 1. Smart Active Provider Inference
Pi extensions run synchronously in the UI. To accurately determine what model you are using (even if you just ran `/model` or resumed a session with `--resume`), the extension uses a robust fallback chain:
1. Direct API: `ctx.getModel()?.provider`
2. Context model: `ctx.model?.provider`
3. Session History: Scans the session branch backwards for the last `model_change` event.
4. Global Settings: `defaultProvider` from `~/.pi/agent/settings.json`.

### 2. Pi-Native Authentication
The extension does not use hardcoded paths. It reads credentials natively from Pi:
- Checks `~/.pi/agent/auth.json` first (for OAuth tokens generated via Pi's `/login` or saved API keys).
- Falls back to standard environment variables (e.g., `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`).

### 3. Portable Timezone Formatting
Reset times (e.g., "Resets: 15:00 on 12 May") are automatically localized. You can force a specific timezone by setting an environment variable. Resolution order:
1. `PI_USAGE_TZ` environment variable (e.g., `export PI_USAGE_TZ=America/Argentina/Buenos_Aires`)
2. `TZ` environment variable
3. System runtime timezone (`Intl.DateTimeFormat`)
4. `UTC` (fallback)

## UI & UX

The terminal output uses specialized formatting:
- **Visual Progress Bars:** `[██████████░░░░] 60%`
- **Traffic Light Indicators:** 🟢 (>70% remaining), 🟡 (30-70% remaining), 🔴 (<30% remaining).
- **Absolute Countdowns:** Clearly shows exactly when limits reset `(in 2h 15m)`.

## Troubleshooting

- **"No limits data" or "Unavailable"**: Ensure you have logged in via `/login` in Pi (for OAuth providers) or that your API keys are exported in your shell.
- **Wrong Reset Timezone**: Export `PI_USAGE_TZ` in your shell profile.
- **"local usage unavailable"**: Verify that `~/.pi/agent/sessions` exists and contains Pi session `.jsonl` files.

## License
MIT
