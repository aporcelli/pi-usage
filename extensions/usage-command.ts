import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
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
const PI_AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");
const PI_SETTINGS_PATH = join(homedir(), ".pi", "agent", "settings.json");

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
  return fetchOpenRouterLimits();
}

function getWeeklySinceDate(): string {
  const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function runLocalUsage(period: "daily" | "weekly" | "monthly"): { ok: boolean; output: string; error?: string } {
  const runners = [
    ["ccusage-pi"],
    ["ccusage"],
    ["npx", "@ccusage/pi@latest"],
  ] as const;

  const args = period === "monthly" ? ["monthly", "--json", "--breakdown"] : period === "weekly" ? ["daily", "--json", "--breakdown", "--since", getWeeklySinceDate()] : ["daily", "--json", "--breakdown"];
  const errs: string[] = [];

  for (const [cmd, firstArg] of runners) {
    const fullArgs = firstArg ? [firstArg, ...args] : args;
    const r = spawnSync(cmd, fullArgs, { encoding: "utf8", timeout: 30000 });
    if (r.status === 0) return { ok: true, output: (r.stdout || "").trim() || "No usage output." };
    errs.push(`${cmd} ${fullArgs.join(" ")} => ${r.stderr?.trim() || `exit ${r.status}`}`);
  }

  return { ok: false, output: "", error: errs.join("\n") };
}

function renderLocalPretty(period: string, raw: string): string | null {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  const rows = (period === "monthly" ? data.monthly : data.daily) || [];
  const t = data.totals || {};
  const inTok = Number(t.inputTokens || 0);
  const outTok = Number(t.outputTokens || 0);
  const cacheTok = Number(t.cacheReadTokens || 0) + Number(t.cacheCreationTokens || 0);
  const totalTok = inTok + outTok + cacheTok;

  const lines: string[] = [];
  lines.push(`📊 Local usage (${period})`);
  lines.push("");
  lines.push(`Cost total:      $${Number(t.totalCost || 0).toFixed(2)}`);
  lines.push(`Tokens total:    ${totalTok.toLocaleString("en-US")}`);
  lines.push(`Input tokens:    ${inTok.toLocaleString("en-US")}`);
  lines.push(`Output tokens:   ${outTok.toLocaleString("en-US")}`);
  lines.push(`Cache tokens:    ${cacheTok.toLocaleString("en-US")}`);

  if (rows.length) {
    lines.push("");
    lines.push(period === "monthly" ? "By month:" : "By day:");
    const maxCost = Math.max(...rows.map((r: any) => Number(r.totalCost || 0)), 0.000001);
    for (const r of rows.slice(0, 12)) {
      const label = r.date || r.month || "(unknown)";
      const c = Number(r.totalCost || 0);
      const p = (c / maxCost) * 100;
      lines.push(`- ${label}  $${c.toFixed(2)}  ${bar(p, 14)}`);
    }
  }

  return lines.join("\n");
}

export default function usageCommand(pi: ExtensionAPI) {
  pi.registerCommand("usage", {
    description: "Show account quota limits by provider or local usage stats",
    getArgumentCompletions: (prefix) => {
      const vals = ["limits", "openai-codex", "anthropic", "openrouter", "local", "daily", "weekly", "monthly"];
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

      if (first === "limits" || first === "openai-codex" || first === "anthropic" || first === "openrouter") {
        const provider = (first === "limits" ? parts[1] : first) || activeProvider;
        
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

        if (!provider || !["openai-codex", "anthropic", "openrouter"].includes(provider)) {
          ctx.ui.notify(asWhite(`⚠️ ${provider || "unknown"} no tiene API de cuotas en este plugin. Fallback a histórico local:\n`), "warning");
          const local = runLocalUsage("daily");
          if (local.ok) {
            const pretty = renderLocalPretty("daily", local.output);
            ctx.ui.notify(asWhite((pretty || local.output).slice(0, 8000)), "info");
          } else {
            ctx.ui.notify(asWhite(`No pude consultar usage local.\n${local.error || ""}`), "error");
          }
          return;
        }

        const res = fetchProviderLimits(provider as "openai-codex" | "anthropic" | "openrouter");
        if (!res.ok) {
          ctx.ui.notify(asWhite(`⚠️ ${provider} limits unavailable\n${res.error || "unknown error"}`), "warning");
          return;
        }
        ctx.ui.notify(asWhite(res.output || "No limits data."), "info");
        return;
      }

      const period = (first === "local" ? "daily" : first) as "daily" | "monthly";
      if (!["daily", "monthly", "local"].includes(period)) {
        ctx.ui.notify("Usage: /usage [limits [openai-codex|anthropic|openrouter]|local|monthly]", "warning");
        return;
      }

      const res = runLocalUsage(period);
      if (!res.ok) {
        ctx.ui.notify(asWhite(`⚠️ local usage unavailable\n${res.error || "unknown error"}`), "warning");
        return;
      }
      ctx.ui.notify(asWhite(renderLocalPretty(period, res.output) || res.output), "info");
    },
  });
}
