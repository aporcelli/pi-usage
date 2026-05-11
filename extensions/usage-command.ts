import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

type Provider = string;

type PiAuthEntry =
  | { type: "oauth"; access?: string; refresh?: string; expires?: number; accountId?: string }
  | { type: "api_key"; key?: string };

type PiAuth = Record<string, PiAuthEntry>;

const ANSI_WHITE = "\u001b[97m";
const ANSI_RESET = "\u001b[0m";
const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const COPILOT_VERSION = "0.35.0";
const COPILOT_EDITOR_VERSION = "vscode/1.107.0";
const PI_AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");
const PI_SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");
const PI_SESSIONS_PATH = join(homedir(), ".pi", "agent", "sessions");

function asWhite(text: string): string {
  return `${ANSI_WHITE}${text}${ANSI_RESET}`;
}

function readJson(path: string): any | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function resolveDisplayTimeZone(): string {
  const candidates = [process.env.PI_USAGE_TZ, process.env.TZ, Intl.DateTimeFormat().resolvedOptions().timeZone, "UTC"];
  for (const c of candidates) {
    const tz = String(c || "").trim();
    if (!tz) continue;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
      return tz;
    } catch {}
  }
  return "UTC";
}
const DISPLAY_TZ = resolveDisplayTimeZone();

function usageTone(percentLeft: number): { icon: string; fill: string } {
  if (percentLeft > 70) return { icon: "🟢", fill: "🟩" };
  if (percentLeft > 30) return { icon: "🟡", fill: "🟨" };
  return { icon: "🔴", fill: "🟥" };
}

function bar(percent: number, width = 24, fillChar = "█"): string {
  const p = Math.max(0, Math.min(100, percent));
  const filled = Math.round((p / 100) * width);
  return `[${fillChar.repeat(filled)}${"░".repeat(Math.max(0, width - filled))}] ${p.toFixed(0)}%`;
}

function fmtCountdown(seconds?: number): string {
  const s = Math.max(0, Math.floor(Number(seconds || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtUSD(n: number): string {
  return `$${Number(n || 0).toFixed(2)}`;
}

function fmtReset(raw?: string | number): string {
  if (raw === undefined || raw === null || raw === "") return "unknown";

  let dt: Date;
  if (typeof raw === "number") dt = new Date(raw < 1_000_000_000_000 ? raw * 1000 : raw);
  else if (/^\d+$/.test(String(raw).trim())) {
    const n = Number(String(raw).trim());
    dt = new Date(n < 1_000_000_000_000 ? n * 1000 : n);
  } else dt = new Date(String(raw));

  if (Number.isNaN(dt.getTime())) return String(raw);

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DISPLAY_TZ,
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
    hour12: false,
  }).formatToParts(dt);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("hour")}:${get("minute")} on ${get("day")} ${get("month")} (${DISPLAY_TZ})`;
}

function defaultProviderFromPiSettings(): string {
  const s = readJson(PI_SETTINGS_PATH);
  return String(s?.defaultProvider || "openai-codex").toLowerCase();
}

function readPiAuth(provider: Provider): PiAuthEntry | null {
  const auth = readJson(PI_AUTH_PATH) as PiAuth | null;
  if (!auth) return null;
  return auth[provider] || null;
}

function runCurlJson(url: string, headers: string[], timeoutMs = 15000): { ok: boolean; json?: any; error?: string } {
  const args = ["-sS", url];
  for (const h of headers) args.push("-H", h);
  const r = spawnSync("curl", args, { encoding: "utf8", timeout: timeoutMs });
  if (r.status !== 0) return { ok: false, error: r.stderr || `curl exit ${r.status}` };
  try {
    return { ok: true, json: JSON.parse(r.stdout || "{}") };
  } catch (e) {
    return { ok: false, error: `invalid json: ${String(e)}` };
  }
}

function ghCliToken(): string | null {
  const r = spawnSync("gh", ["auth", "token"], {
    encoding: "utf8",
    timeout: 5000,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (r.status !== 0) return null;
  const t = String(r.stdout || "").trim();
  return t || null;
}

function copilotHeaders(authHeader: string): string[] {
  return [
    `Authorization: ${authHeader}`,
    "Accept: application/json",
    `User-Agent: GitHubCopilotChat/${COPILOT_VERSION}`,
    `Editor-Version: ${COPILOT_EDITOR_VERSION}`,
    `Editor-Plugin-Version: copilot-chat/${COPILOT_VERSION}`,
    "Copilot-Integration-Id: vscode-chat",
    "Content-Type: application/json",
  ];
}

function refreshCodexToken(refreshToken: string): string | null {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CODEX_OAUTH_CLIENT_ID,
  });
  const r = spawnSync(
    "curl",
    [
      "-sS",
      "-X",
      "POST",
      "https://auth.openai.com/oauth/token",
      "-H",
      "Content-Type: application/x-www-form-urlencoded",
      "--data",
      body.toString(),
    ],
    { encoding: "utf8", timeout: 15000 },
  );
  if (r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout || "{}");
    return typeof j.access_token === "string" ? j.access_token : null;
  } catch {
    return null;
  }
}

function fetchCodexLimits(): { ok: boolean; output?: string; error?: string } {
  const e = readPiAuth("openai-codex") as PiAuthEntry | null;
  if (!e || e.type !== "oauth") return { ok: false, error: "No openai-codex OAuth in ~/.pi/agent/auth.json. Run /login." };
  const access = String(e.access || "").trim();
  const refresh = String(e.refresh || "").trim();
  if (!access || !refresh) return { ok: false, error: "Missing access/refresh token for openai-codex." };

  const call = (token: string) =>
    runCurlJson("https://chatgpt.com/backend-api/wham/usage", [
      `Authorization: Bearer ${token}`,
      "Accept: application/json",
      "User-Agent: codex-cli",
      ...(e.accountId ? [`ChatGPT-Account-Id: ${e.accountId}`] : []),
    ]);

  let r = call(access);
  if (!r.ok) {
    const newAccess = refreshCodexToken(refresh);
    if (newAccess) r = call(newAccess);
  }
  if (!r.ok || !r.json) return { ok: false, error: r.error || "Codex usage unavailable" };

  const p = r.json?.rate_limit?.primary_window || {};
  const s = r.json?.rate_limit?.secondary_window || {};
  const pLeft = Math.max(0, 100 - Number(p.used_percent || 0));
  const sLeft = Math.max(0, 100 - Number(s.used_percent || 0));
  const pt = usageTone(pLeft), st = usageTone(sLeft);

  const lines: string[] = [];
  lines.push("📈 Account limits (ChatGPT Codex)");
  if (r.json?.email) lines.push(`Account: ${r.json.email}`);
  if (r.json?.plan_type) lines.push(`Plan: ${r.json.plan_type}`);
  lines.push("");
  lines.push(`${pt.icon} 5h window:  ${bar(pLeft, 24, pt.fill)}  left ${pLeft.toFixed(0)}%`);
  lines.push(`   Resets:    ${fmtReset(p.reset_at)} (in ${fmtCountdown(p.reset_after_seconds)})`);
  lines.push("");
  lines.push(`${st.icon} Weekly:     ${bar(sLeft, 24, st.fill)}  left ${sLeft.toFixed(0)}%`);
  lines.push(`   Resets:    ${fmtReset(s.reset_at)} (in ${fmtCountdown(s.reset_after_seconds)})`);
  return { ok: true, output: lines.join("\n") };
}

function fetchAnthropicLimits(): { ok: boolean; output?: string; error?: string } {
  const e = readPiAuth("anthropic") as PiAuthEntry | null;
  const token = e?.type === "oauth" ? String(e.access || "").trim() : String(process.env.ANTHROPIC_API_KEY || "").trim();
  if (!token) return { ok: false, error: "No Anthropic auth found. Use /login or set ANTHROPIC_API_KEY." };

  const r = runCurlJson("https://api.anthropic.com/api/oauth/usage", [
    `Authorization: Bearer ${token}`,
    "Accept: application/json",
    "Content-Type: application/json",
    "anthropic-beta: oauth-2025-04-20",
    "User-Agent: pi-usage-extension",
  ]);
  if (!r.ok || !r.json) return { ok: false, error: r.error || "Anthropic usage unavailable" };

  const five = r.json?.five_hour;
  const week = r.json?.seven_day;
  if (!five && !week) return { ok: false, error: "No Anthropic quota windows in response." };

  const lines: string[] = ["📈 Account limits (Anthropic OAuth)"];
  const emit = (label: string, w: any) => {
    if (!w || w.utilization === undefined) return;
    const used = Number(w.utilization) <= 1 ? Number(w.utilization) * 100 : Number(w.utilization);
    const left = Math.max(0, 100 - used);
    const t = usageTone(left);
    lines.push("");
    lines.push(`${t.icon} ${label}: ${bar(left, 24, t.fill)}  left ${left.toFixed(0)}%`);
    lines.push(`   Resets:    ${fmtReset(w.resets_at)}`);
  };
  emit("5h window", five);
  emit("Weekly", week);
  return { ok: true, output: lines.join("\n") };
}

type CopilotWindow = {
  label: string;
  used: number;
  limit: number;
  resetAt?: string | number;
  next?: string;
  unlimited?: boolean;
};

function parseGitHubCopilotWindows(data: any): CopilotWindow[] {
  const roots = [data, data?.data, data?.payload, data?.user].filter(Boolean);

  const asNum = (...vals: any[]) => {
    for (const v of vals) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  };

  for (const root of roots) {
    const out: CopilotWindow[] = [];
    const resetAt = root?.quota_reset_date ?? root?.quota_reset_date_utc ?? root?.limited_user_reset_date;

    const snapshots = root?.quota_snapshots;
    if (snapshots && typeof snapshots === "object") {
      const map: Array<[string, string]> = [
        ["premium_interactions", "Premium / month"],
        ["chat", "Chat / month"],
        ["completions", "Completions / month"],
      ];

      for (const [key, label] of map) {
        const snap = snapshots[key];
        if (!snap) continue;

        const unlimited = !!(snap.unlimited || snap.is_unlimited);
        if (unlimited) {
          out.push({ label, used: 0, limit: 0, resetAt, unlimited: true, next: "unlimited" });
          continue;
        }

        const limit = asNum(snap.entitlement, snap.limit, snap.quota, snap.total);
        const remaining = asNum(snap.remaining, snap.quota_remaining, snap.left, snap.available);
        const used = limit > 0 ? Math.max(0, limit - remaining) : asNum(snap.used, snap.consumed);
        if (limit <= 0 && used <= 0) continue;

        const overage = asNum(snap.overage_count);
        const overagePermitted = !!snap.overage_permitted;
        out.push({
          label,
          used,
          limit,
          resetAt,
          next: overage > 0 ? `+${overage} overage` : overagePermitted ? "overage allowed" : undefined,
        });
      }

      if (out.length) return out;
    }

    if (root?.monthly_quotas && root?.limited_user_quotas) {
      for (const [key, label] of [["chat", "Chat / month"], ["completions", "Completions / month"]] as const) {
        const limit = asNum(root.monthly_quotas[key]);
        const remaining = asNum(root.limited_user_quotas[key]);
        if (limit <= 0) continue;
        out.push({ label, used: Math.max(0, limit - remaining), limit, resetAt });
      }
      if (out.length) return out;
    }

    if (Array.isArray(root?.quota_windows)) {
      for (const w of root.quota_windows) {
        const label = String(w?.name || w?.label || "Quota");
        const limit = asNum(w?.limit, w?.entitlement, w?.max);
        const used = asNum(w?.used, w?.consumed, limit - asNum(w?.remaining));
        if (limit <= 0 && used <= 0) continue;
        out.push({ label, used: Math.max(0, used), limit, resetAt: w?.resets_at ?? w?.reset_at });
      }
      if (out.length) return out;
    }
  }

  return [];
}

function fetchGitHubCopilotLimits(): { ok: boolean; output?: string; error?: string } {
  const e = readPiAuth("github-copilot") as PiAuthEntry | null;
  const stored = e?.type === "oauth" ? String(e.access || "").trim() : "";
  const tokens = [stored, String(process.env.GITHUB_TOKEN || "").trim(), String(process.env.GH_TOKEN || "").trim()].filter(Boolean);
  const cli = ghCliToken();
  if (cli && !tokens.includes(cli)) tokens.push(cli);
  if (!tokens.length) return { ok: false, error: "No GitHub Copilot token found. Login in Pi or run 'gh auth login'." };

  const tryUsage = (authHeader: string) =>
    runCurlJson("https://api.github.com/copilot_internal/user", copilotHeaders(authHeader));

  let usageResp: { ok: boolean; json?: any; error?: string } | null = null;

  for (const t of tokens) {
    // 1) Try exchange endpoint
    const exchange = runCurlJson("https://api.github.com/copilot_internal/v2/token", copilotHeaders(`Bearer ${t}`));
    if (exchange.ok && exchange.json?.token) {
      const usage = tryUsage(`Bearer ${exchange.json.token}`);
      if (usage.ok && usage.json) {
        usageResp = usage;
        break;
      }
    }

    // 2) Try direct forms
    for (const auth of [`token ${t}`, `Bearer ${t}`]) {
      const usage = tryUsage(auth);
      if (usage.ok && usage.json) {
        usageResp = usage;
        break;
      }
    }
    if (usageResp) break;
  }

  if (!usageResp?.ok || !usageResp.json) {
    return { ok: false, error: usageResp?.error || "GitHub Copilot usage unavailable" };
  }

  const windows = parseGitHubCopilotWindows(usageResp.json);
  if (!windows.length) {
    const root = usageResp.json?.data ?? usageResp.json;
    const keys = Object.keys(root || {}).slice(0, 12).join(", ");
    return { ok: false, error: `No Copilot quota windows in response. Keys: ${keys || "none"}` };
  }

  const lines: string[] = ["📈 Account limits (GitHub Copilot)"];
  for (const w of windows) {
    lines.push("");

    if (w.unlimited || w.limit <= 0) {
      lines.push(`🟢 ${w.label}: unlimited`);
      if (w.next) lines.push(`   Note:      ${w.next}`);
      if (w.resetAt) lines.push(`   Resets:    ${fmtReset(w.resetAt)}`);
      continue;
    }

    const usedPct = (w.used / w.limit) * 100;
    const left = Math.max(0, 100 - usedPct);
    const t = usageTone(left);
    lines.push(`${t.icon} ${w.label}: ${bar(left, 24, t.fill)}  left ${left.toFixed(0)}%`);
    lines.push(`   Usage:     ${w.used.toLocaleString("en-US")} / ${w.limit.toLocaleString("en-US")}`);
    if (w.resetAt) lines.push(`   Resets:    ${fmtReset(w.resetAt)}`);
    if (w.next) lines.push(`   Note:      ${w.next}`);
  }

  return { ok: true, output: lines.join("\n") };
}

function fetchOpenRouterLimits(): { ok: boolean; output?: string; error?: string } {
  const e = readPiAuth("openrouter") as PiAuthEntry | null;
  const key = e?.type === "api_key" ? String(e.key || "").trim() : String(process.env.OPENROUTER_API_KEY || "").trim();
  if (!key) return { ok: false, error: "No OPENROUTER_API_KEY (or auth.json openrouter key) found." };

  const base = String(process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const headers = [`Authorization: Bearer ${key}`, "Accept: application/json"];
  const credits = runCurlJson(`${base}/credits`, headers);
  const quota = runCurlJson(`${base}/key`, headers);
  if (!credits.ok || !credits.json) return { ok: false, error: credits.error || "OpenRouter credits unavailable" };

  const c = credits.json?.data || {};
  const total = Number(c.total_credits || 0);
  const used = Number(c.total_usage || 0);
  const leftUsd = Math.max(0, total - used);

  const lines: string[] = ["📈 Account limits (OpenRouter)"];
  if (quota.ok && quota.json?.data) {
    const q = quota.json.data;
    const lim = Number(q.limit || 0);
    const rem = Number(q.limit_remaining || 0);
    if (lim > 0 && rem >= 0 && rem <= lim) {
      const left = (rem / lim) * 100;
      const t = usageTone(left);
      lines.push("");
      lines.push(`${t.icon} Key quota:   ${bar(left, 24, t.fill)}  left ${left.toFixed(0)}%`);
      lines.push(`   Resets:      ${q.limit_reset || "n/a"}`);
    }
  }

  lines.push("");
  lines.push(`Credits left: ${fmtUSD(leftUsd)} (used ${fmtUSD(used)} / total ${fmtUSD(total)})`);
  return { ok: true, output: lines.join("\n") };
}

function fetchProviderLimits(provider: Provider): { ok: boolean; output?: string; error?: string } {
  if (provider === "openai-codex") return fetchCodexLimits();
  if (provider === "anthropic") return fetchAnthropicLimits();
  if (provider === "github-copilot") return fetchGitHubCopilotLimits();
  return fetchOpenRouterLimits();
}

type UsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
  calls: number;
};

function zeroUsage(): UsageTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0, calls: 0 };
}

function addUsage(target: UsageTotals, raw: any) {
  const input = Number(raw?.input || 0);
  const output = Number(raw?.output || 0);
  const cacheRead = Number(raw?.cacheRead || 0);
  const cacheWrite = Number(raw?.cacheWrite || 0);
  const total = Number(raw?.totalTokens || input + output + cacheRead + cacheWrite);
  const cost = Number(raw?.cost?.total || 0);

  target.input += input;
  target.output += output;
  target.cacheRead += cacheRead;
  target.cacheWrite += cacheWrite;
  target.total += total;
  target.cost += cost;
  target.calls += 1;
}

function collectJsonlFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    let entries: any[];
    try {
      entries = readdirSync(p, { withFileTypes: true }) as any[];
    } catch {
      return;
    }
    for (const e of entries) {
      const name = String(e.name || "");
      const full = join(p, name);
      if (e.isDirectory?.()) walk(full);
      else if (e.isFile?.() && name.endsWith(".jsonl")) out.push(full);
    }
  };
  walk(dir);
  return out;
}

function tsToMs(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const ms = Date.parse(v);
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
}

function formatWindow(label: string, u: UsageTotals): string {
  const cache = u.cacheRead + u.cacheWrite;
  return `${label.padEnd(5)}  calls ${String(u.calls).padStart(5)}  tokens ${u.total.toLocaleString("en-US").padStart(12)}  in ${u.input.toLocaleString("en-US").padStart(11)}  out ${u.output.toLocaleString("en-US").padStart(11)}  cache ${cache.toLocaleString("en-US").padStart(11)}  cost ${fmtUSD(u.cost)}`;
}

function renderLocalUsageFromSessions(): { ok: boolean; output: string; error?: string } {
  const files = collectJsonlFiles(PI_SESSIONS_PATH);
  if (!files.length) {
    return { ok: false, output: "", error: `No Pi sessions found in ${PI_SESSIONS_PATH}` };
  }

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;

  const day = zeroUsage();
  const week = zeroUsage();
  const month = zeroUsage();

  for (const file of files) {
    let raw = "";
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let evt: any;
      try {
        evt = JSON.parse(line);
      } catch {
        continue;
      }

      if (evt?.type !== "message") continue;
      if (evt?.message?.role !== "assistant") continue;
      const usage = evt?.message?.usage || evt?.usage;
      if (!usage) continue;

      const ts = tsToMs(evt?.timestamp) ?? tsToMs(evt?.message?.timestamp);
      if (!ts) continue;
      const age = now - ts;
      if (age < 0 || age > monthMs) continue;

      if (age <= monthMs) addUsage(month, usage);
      if (age <= weekMs) addUsage(week, usage);
      if (age <= dayMs) addUsage(day, usage);
    }
  }

  const lines = [
    "📊 Local usage (Pi sessions)",
    "",
    formatWindow("24h", day),
    formatWindow("7d", week),
    formatWindow("30d", month),
  ];

  if (month.calls === 0) {
    lines.push("", "No assistant usage records found in the last 30 days.");
  }

  return { ok: true, output: lines.join("\n") };
}

export default function usageCommand(pi: ExtensionAPI) {
  pi.registerCommand("usage", {
    description: "Show account quota limits by provider or local usage stats",
    getArgumentCompletions: (prefix) => {
      const vals = ["limits", "openai-codex", "anthropic", "github-copilot", "openrouter", "local"];
      return vals.filter((v) => v.startsWith(prefix)).map((v) => ({ value: v, label: v }));
    },
    handler: async (args, ctx) => {
      const parts = String(args || "").trim().split(/\s+/).filter(Boolean);
      const first = parts[0] || "limits";

      const activeProvider =
        (ctx as any).getModel?.()?.provider ||
        ctx.model?.provider ||
        (ctx as any).sessionManager?.getBranch?.()?.slice().reverse().find((e: any) => e.type === "model_change")?.provider ||
        defaultProviderFromPiSettings();

      if (first === "limits" || first === "openai-codex" || first === "anthropic" || first === "github-copilot" || first === "openrouter") {
        if (first === "limits" && parts[1]) {
          ctx.ui.notify(asWhite("Use /usage <provider> for explicit provider checks. '/usage limits' only uses the active provider."), "warning");
          return;
        }

        const provider = first === "limits" ? activeProvider : first;
        
        // Always show session token usage first (like Hermes) if > 0
        const usage = typeof (ctx as any).getContextUsage === "function" ? (ctx as any).getContextUsage() : undefined;
        if (usage) {
          const inTok = usage.inputTokens || 0;
          const outTok = usage.outputTokens || 0;
          const totalTok = inTok + outTok;
          
          if (totalTok > 0) {
            let ctxStr = "unknown";
            if (usage.contextLength) {
              const p = ((inTok / usage.contextLength) * 100).toFixed(0);
              ctxStr = `${inTok.toLocaleString("en-US")} / ${usage.contextLength.toLocaleString("en-US")} (${p}%)`;
            }

            const lines = [
              "📊 Session Token Usage",
              "────────────────────────────────────────",
              `Model:             ${ctx.model?.id || "unknown"}`,
              `Input tokens:      ${inTok.toLocaleString("en-US")}`,
              `Output tokens:     ${outTok.toLocaleString("en-US")}`,
              `Total tokens:      ${totalTok.toLocaleString("en-US")}`,
              "────────────────────────────────────────",
              `Current context:   ${ctxStr}`,
              ""
            ];
            ctx.ui.notify(asWhite(lines.join("\n")), "info");
          }
        }

        if (!provider || !["openai-codex", "anthropic", "github-copilot", "openrouter"].includes(provider)) {
          ctx.ui.notify(asWhite(`⚠️ ${provider || "unknown"} has no quota API in this plugin. Falling back to local usage.\n`), "warning");
          const local = renderLocalUsageFromSessions();
          if (local.ok) ctx.ui.notify(asWhite(local.output.slice(0, 8000)), "info");
          else ctx.ui.notify(asWhite(`Local usage unavailable.\n${local.error || ""}`), "error");
          return;
        }

        const res = fetchProviderLimits(provider as "openai-codex" | "anthropic" | "github-copilot" | "openrouter");
        if (!res.ok) {
          ctx.ui.notify(asWhite(`⚠️ ${provider} limits unavailable\n${res.error || "unknown error"}`), "warning");
          return;
        }
        ctx.ui.notify(asWhite(res.output || "No limits data."), "info");
        return;
      }

      if (first !== "local") {
        ctx.ui.notify("Usage: /usage | /usage limits | /usage <openai-codex|anthropic|github-copilot|openrouter> | /usage local", "warning");
        return;
      }

      const local = renderLocalUsageFromSessions();
      if (!local.ok) {
        ctx.ui.notify(asWhite(`⚠️ local usage unavailable\n${local.error || "unknown error"}`), "warning");
        return;
      }
      ctx.ui.notify(asWhite(local.output), "info");
    },
  });
}
