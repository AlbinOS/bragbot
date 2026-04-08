import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, BrowserView, Utils, ApplicationMenu, Updater } from "electrobun/bun";
import Electrobun from "electrobun/bun";
import { crawl } from "./crawler/index";
import { setToken } from "./crawler/github";
import { TokenExpiredError } from "./crawler/github";
import { loadToken, clearToken, startDeviceFlow, pollForToken, validateToken, saveTokenDirect } from "./auth";
import { loadJiraCreds, saveJiraCreds, clearJiraCreds, validateJiraCreds } from "./jira-auth";
import { setJiraCredentials } from "./jira-crawler/jira";
import { crawlJira, loadJiraData } from "./jira-crawler/index";
import { setConfluenceCredentials } from "./confluence-crawler/confluence";
import { crawlConfluence, loadConfluenceData } from "./confluence-crawler/index";

const debug = false; // set to true for fresh temp data dir each launch
const DEFAULT_DATA_DIR = debug
  ? path.join(os.tmpdir(), `bragbot-${Date.now()}`, "data")
  : path.join(os.homedir(), "Library/Application Support/BragBot/data");

const GITHUB_DATA_DIR = path.join(DEFAULT_DATA_DIR, "github");
const JIRA_DATA_DIR = path.join(DEFAULT_DATA_DIR, "jira");
const CONFLUENCE_DATA_DIR = path.join(DEFAULT_DATA_DIR, "confluence");
const REVIEW_SIGNATURES_PATH = path.join(os.homedir(), "Library", "Application Support", "BragBot", "review-signatures.json");

function loadReviewSignatures(): { emoji: string; pattern: string; label: string }[] {
  if (!fs.existsSync(REVIEW_SIGNATURES_PATH)) {
    const defaults = [
      { emoji: "✅", pattern: "\\bLGTM\\b|\\blooks good\\b|\\blooks great\\b", label: "LGTM" },
      { emoji: "🐐", pattern: "🐐|:goat:|(?:^|\\s)goat(?:\\s|$)|(?:^|\\s)GOAT(?:\\s|$)", label: "goat" },
      { emoji: "👍", pattern: "👍|:\\+1:|:thumbsup:", label: "thumbs up" },
      { emoji: "🔥", pattern: "🔥|:fire:", label: "fire" },
      { emoji: "🚀", pattern: "🚀|:rocket:", label: "rocket" },
      { emoji: "🎉", pattern: "🎉|:tada:", label: "tada" },
      { emoji: "💯", pattern: "💯|:100:", label: "100" },
      { emoji: "👀", pattern: "👀|:eyes:", label: "eyes" },
      { emoji: "🤩", pattern: "🤩|:starstruck:", label: "starstruck" },
      { emoji: "❤️", pattern: "❤️|:heart:", label: "heart" },
      { emoji: "😂", pattern: "😂|:joy:", label: "laugh" },
      { emoji: "👑", pattern: "👑|:crown:|:king:", label: "crown" },
    ];
    fs.mkdirSync(path.dirname(REVIEW_SIGNATURES_PATH), { recursive: true });
    fs.writeFileSync(REVIEW_SIGNATURES_PATH, JSON.stringify({ patterns: defaults }, null, 2));
    return defaults;
  }
  try {
    const data = JSON.parse(fs.readFileSync(REVIEW_SIGNATURES_PATH, "utf-8"));
    return data.patterns ?? [];
  } catch {
    return [];
  }
}

if (debug) console.log(`[debug] Data dir: ${DEFAULT_DATA_DIR}`);

function findOrgDir(dataDir: string): string | null {
  if (!fs.existsSync(dataDir)) return null;
  const entries = fs.readdirSync(dataDir, { withFileTypes: true });
  const dir = entries.find((e) => e.isDirectory() && fs.existsSync(path.join(dataDir, e.name, "_meta.json")));
  return dir ? path.join(dataDir, dir.name) : null;
}

function loadMeta(orgDir: string) {
  const metaPath = path.join(orgDir, "_meta.json");
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
}

function loadRepoData(orgDir: string, repoFullName: string) {
  const short = repoFullName.split("/").pop()!;
  const filePath = path.join(orgDir, `${short}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// Crawl state
let crawlAbort: AbortController | null = null;
let authAbort: AbortController | null = null;
let jiraCrawlAbort: AbortController | null = null;
let confluenceCrawlAbort: AbortController | null = null;

// Load saved Jira creds on startup
const savedJiraCreds = loadJiraCreds();
if (savedJiraCreds) {
  setJiraCredentials(savedJiraCreds.email, savedJiraCreds.token, savedJiraCreds.site);
  setConfluenceCredentials(savedJiraCreds.email, savedJiraCreds.token, savedJiraCreds.site);
}

// Load saved token on startup
const savedToken = loadToken();
if (savedToken) setToken(savedToken);

const mainviewRPC = BrowserView.defineRPC({
  handlers: {
    requests: {
      "auth:status": async () => {
        const token = loadToken();
        if (!token) return { authenticated: false };
        const user = await validateToken(token);
        if (!user) { clearToken(); return { authenticated: false }; }
        setToken(token);
        return { authenticated: true, user };
      },
      "auth:startDeviceFlow": async () => {
        const flow = await startDeviceFlow();
        // Start polling in background
        authAbort = new AbortController();
        pollForToken(flow.device_code, flow.interval, authAbort.signal)
          .then((token) => {
            setToken(token);
            validateToken(token).then((user) => {
              try { (mainviewRPC as any).send("auth:complete", { success: true, user }); } catch {}
            });
          })
          .catch((err) => {
            try { (mainviewRPC as any).send("auth:complete", { success: false, error: String(err) }); } catch {}
          })
          .finally(() => { authAbort = null; });
        return { user_code: flow.user_code, verification_uri: flow.verification_uri, expires_in: flow.expires_in };
      },
      "auth:cancel": () => {
        authAbort?.abort();
        return { ok: true };
      },
      "auth:logout": () => {
        clearToken();
        setToken("");
        return { ok: true };
      },
      "auth:loginWithPat": async (_args: any) => {
        const user = await validateToken(_args.token);
        if (!user) return { success: false, error: "Invalid token" };
        saveTokenDirect(_args.token);
        setToken(_args.token);
        return { success: true, user };
      },
      "auth:detectGhCli": async () => {
        const env = { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` };
        try {
          const which = Bun.spawnSync(["which", "gh"], { env });
          if (which.exitCode !== 0) return { available: false, reason: "gh not installed" };
          const ghPath = which.stdout.toString().trim();
          const token = Bun.spawnSync([ghPath, "auth", "token"], { env });
          if (token.exitCode !== 0) return { available: false, reason: "gh not authenticated" };
          const t = token.stdout.toString().trim();
          const user = await validateToken(t);
          if (!user) return { available: false, reason: "gh token invalid or missing scopes" };
          return { available: true, user, token: t };
        } catch { return { available: false, reason: "Failed to detect gh" }; }
      },
      "auth:loginWithGhCli": async () => {
        const env = { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` };
        const token = Bun.spawnSync(["gh", "auth", "token"], { env });
        if (token.exitCode !== 0) return { success: false, error: "gh auth token failed" };
        const t = token.stdout.toString().trim();
        const user = await validateToken(t);
        if (!user) return { success: false, error: "Token invalid" };
        saveTokenDirect(t);
        setToken(t);
        return { success: true, user };
      },
      "auth:getOrgs": async () => {
        const { apiFetch } = await import("./crawler/github");
        const resp = await apiFetch("https://api.github.com/user/orgs", { per_page: "100" });
        if (!resp.ok) return [];
        const orgs = await resp.json();
        return orgs.map((o: any) => o.login);
      },
      "data:exportAIContext": async (args: any) => {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const outPath = args.path || path.join(DEFAULT_DATA_DIR, "ai-context.md");
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, args.content, "utf-8");
        return { ok: true, path: outPath };
      },
      "data:contextFiles": () => {
        const contextDir = path.join(DEFAULT_DATA_DIR, "context");
        const supported = ["role.md", "role_target.md", "goals.md", "notes.md"];
        const found: string[] = [];
        for (const f of supported) {
          if (fs.existsSync(path.join(contextDir, f))) found.push(f);
        }
        return { dir: contextDir, found };
      },
      "clipboard:write": (args: any) => {
        Utils.clipboardWriteText(args.text);
        return { ok: true };
      },
      "data:getMeta": () => {
        const orgDir = findOrgDir(GITHUB_DATA_DIR);
        if (!orgDir) return { error: "No data found" };
        return loadMeta(orgDir);
      },
      "data:getRepo": (params: unknown) => {
        const { repoFullName } = params as { repoFullName: string };
        const orgDir = findOrgDir(GITHUB_DATA_DIR);
        if (!orgDir) return { error: "No data found" };
        return loadRepoData(orgDir, repoFullName);
      },
      "data:getAllRepos": () => {
        const orgDir = findOrgDir(GITHUB_DATA_DIR);
        if (!orgDir) return { error: "No data found" };
        const meta = loadMeta(orgDir);
        if (!meta) return { error: "No meta found" };
        return meta.repos.map((r: string) => loadRepoData(orgDir, r)).filter(Boolean);
      },
      "crawl:start": (params: unknown) => {
        if (crawlAbort) return { error: "Crawl already running" };
        const opts = (params ?? {}) as { org?: string; since?: string; until?: string; force?: boolean };
        const orgDir = findOrgDir(GITHUB_DATA_DIR);
        const existingMeta = orgDir ? loadMeta(orgDir) : null;
        const org = opts.org ?? existingMeta?.org;

        crawlAbort = new AbortController();
        const signal = crawlAbort.signal;

        // Run async, don't await — return immediately
        crawl({
          org,
          dataDir: GITHUB_DATA_DIR,
          since: opts.since,
          until: opts.until,
          force: opts.force,
          signal,
          onLog: (msg) => {
            try { (mainviewRPC as any).send("crawl:log", { msg }); } catch {}
          },
          onRepoComplete: (repo) => {
            try { (mainviewRPC as any).send("crawl:repoComplete", { repo }); } catch {}
          },
        })
          .then(() => {
            try { (mainviewRPC as any).send("crawl:done", { success: true }); } catch {}
          })
          .catch((err) => {
            if (err instanceof TokenExpiredError) {
              clearToken();
              setToken("");
              try { (mainviewRPC as any).send("auth:expired", {}); } catch {}
            }
            const msg = signal.aborted ? "Crawl cancelled" : String(err);
            try { (mainviewRPC as any).send("crawl:done", { success: false, error: msg }); } catch {}
          })
          .finally(() => {
            crawlAbort = null;
          });

        return { started: true, org };
      },
      "crawl:stop": () => {
        if (!crawlAbort) return { error: "No crawl running" };
        crawlAbort.abort();
        return { stopped: true };
      },
      "crawl:status": () => {
        return { running: !!crawlAbort };
      },
      "jira:auth:status": () => {
        const creds = loadJiraCreds();
        if (!creds) return { authenticated: false };
        return { authenticated: true, email: creds.email, site: creds.site };
      },
      "jira:auth:save": async (args: any) => {
        const { email, token, site } = args as { email: string; token: string; site: string };
        const valid = await validateJiraCreds(email, token, site);
        if (!valid) return { success: false, error: "Invalid credentials" };
        saveJiraCreds(email, token, site);
        setJiraCredentials(email, token, site);
        setConfluenceCredentials(email, token, site);
        return { success: true };
      },
      "jira:auth:detectEnv": () => {
        const site = process.env.JIRA_SITE || process.env.ATLASSIAN_SITE || "";
        const email = process.env.JIRA_EMAIL || process.env.ATLASSIAN_EMAIL || "";
        const token = process.env.JIRA_API_TOKEN || process.env.ATLASSIAN_TOKEN || "";
        return {
          available: !!(site && email && token),
          site: site || undefined,
          email: email || undefined,
          hasToken: !!token,
        };
      },
      "jira:auth:loginWithEnv": async () => {
        const site = process.env.JIRA_SITE || process.env.ATLASSIAN_SITE || "";
        const email = process.env.JIRA_EMAIL || process.env.ATLASSIAN_EMAIL || "";
        const token = process.env.JIRA_API_TOKEN || process.env.ATLASSIAN_TOKEN || "";
        if (!site || !email || !token) return { success: false, error: "Missing env vars" };
        const valid = await validateJiraCreds(email, token, site);
        if (!valid) return { success: false, error: "Invalid credentials" };
        saveJiraCreds(email, token, site);
        setJiraCredentials(email, token, site);
        setConfluenceCredentials(email, token, site);
        return { success: true };
      },
      "jira:auth:logout": () => {
        clearJiraCreds();
        setJiraCredentials("", "", "");
        setConfluenceCredentials("", "", "");
        return { ok: true };
      },
      "jira:data:get": () => {
        return loadJiraData(JIRA_DATA_DIR);
      },
      "jira:crawl:start": (params: unknown) => {
        if (jiraCrawlAbort) return { error: "Jira crawl already running" };
        const opts = (params ?? {}) as { since?: string; until?: string };
        const since = opts.since ?? new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];
        const until = opts.until ?? new Date().toISOString().split("T")[0];

        jiraCrawlAbort = new AbortController();
        const signal = jiraCrawlAbort.signal;

        crawlJira({ since, until }, JIRA_DATA_DIR,
          (msg) => { try { (mainviewRPC as any).send("jira:crawl:log", { msg }); } catch {} },
          signal,
        )
          .then(() => { try { (mainviewRPC as any).send("jira:crawl:done", { success: true }); } catch {} })
          .catch((err) => {
            const msg = signal.aborted ? "Jira crawl cancelled" : String(err);
            try { (mainviewRPC as any).send("jira:crawl:done", { success: false, error: msg }); } catch {}
          })
          .finally(() => { jiraCrawlAbort = null; });

        return { started: true };
      },
      "jira:crawl:stop": () => {
        if (!jiraCrawlAbort) return { error: "No Jira crawl running" };
        jiraCrawlAbort.abort();
        return { stopped: true };
      },
      "confluence:data:get": () => {
        return loadConfluenceData(CONFLUENCE_DATA_DIR);
      },
      "config:reviewSignatures": () => {
        return loadReviewSignatures();
      },
      "confluence:crawl:start": (params: unknown) => {
        if (confluenceCrawlAbort) return { error: "Confluence crawl already running" };
        const opts = (params ?? {}) as { since?: string; until?: string };
        const since = opts.since ?? new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];
        const until = opts.until ?? new Date().toISOString().split("T")[0];

        confluenceCrawlAbort = new AbortController();
        const signal = confluenceCrawlAbort.signal;

        crawlConfluence({ since, until }, CONFLUENCE_DATA_DIR,
          (msg) => { try { (mainviewRPC as any).send("confluence:crawl:log", { msg }); } catch {} },
          signal,
        )
          .then(() => { try { (mainviewRPC as any).send("confluence:crawl:done", { success: true }); } catch {} })
          .catch((err) => {
            const msg = signal.aborted ? "Confluence crawl cancelled" : String(err);
            try { (mainviewRPC as any).send("confluence:crawl:done", { success: false, error: msg }); } catch {}
          })
          .finally(() => { confluenceCrawlAbort = null; });

        return { started: true };
      },
      "confluence:crawl:stop": () => {
        if (!confluenceCrawlAbort) return { error: "No Confluence crawl running" };
        confluenceCrawlAbort.abort();
        return { stopped: true };
      },
      "updater:check": async () => {
        try {
          const result = await Updater.checkForUpdate();
          return result;
        } catch (e: any) {
          return { updateAvailable: false, error: e.message };
        }
      },
      "updater:download": async () => {
        try {
          Updater.onStatusChange((entry) => {
            try { (mainviewRPC as any).send("updater:status", entry); } catch {}
          });
          await Updater.downloadUpdate();
          return { ok: true };
        } catch (e: any) {
          return { ok: false, error: e.message };
        }
      },
      "updater:apply": async () => {
        try {
          await Updater.applyUpdate();
          return { ok: true };
        } catch (e: any) {
          return { ok: false, error: e.message };
        }
      },
      "updater:localInfo": async () => {
        try {
          return {
            version: await Updater.localInfo.version(),
            channel: await Updater.localInfo.channel(),
          };
        } catch { return { version: "unknown", channel: "dev" }; }
      },
    },
    messages: {},
  },
});

ApplicationMenu.setApplicationMenu([
  { label: "BragBot", submenu: [
    { role: "about" },
    { type: "separator" },
    { role: "hide" },
    { role: "hideOthers" },
    { role: "showAll" },
    { type: "separator" },
    { role: "quit" },
  ]},
  { label: "Edit", submenu: [
    { role: "undo" },
    { role: "redo" },
    { type: "separator" },
    { role: "cut" },
    { role: "copy" },
    { role: "paste" },
    { role: "selectAll" },
  ]},
  { label: "Window", submenu: [
    { role: "minimize" },
    { role: "zoom" },
    { role: "close" },
  ]},
]);

const win = new BrowserWindow({
  title: "BragBot",
  url: "views://mainview/index.html",
  titleBarStyle: "default",
  frame: {
    width: 1200,
    height: 900,
    x: 200,
    y: 100,
  },
  rpc: mainviewRPC,
});

Electrobun.events.on(
  `new-window-open-${win.webview.id}`,
  (event: { data?: { detail?: string | { url?: string } } }) => {
    const detail = event.data?.detail;
    const url = typeof detail === "string" ? detail : detail?.url;
    if (url) Utils.openExternal(url);
  }
);

process.on("SIGINT", () => { crawlAbort?.abort(); Utils.quit(); });
process.on("SIGTERM", () => { crawlAbort?.abort(); Utils.quit(); });
