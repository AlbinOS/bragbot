import type { Meta, RepoData } from "./types";

function getRpc(): any {
  return (window as any).__electrobun?.rpc;
}

export async function getAuthStatus(): Promise<{ authenticated: boolean; user?: string }> {
  return getRpc().request["auth:status"]();
}

export async function startDeviceFlow(): Promise<{ user_code: string; verification_uri: string; expires_in: number }> {
  return getRpc().request["auth:startDeviceFlow"]();
}

export async function cancelAuth() {
  return getRpc().request["auth:cancel"]();
}

export async function logout() {
  return getRpc().request["auth:logout"]();
}

export async function loginWithPat(token: string): Promise<{ success: boolean; user?: string; error?: string }> {
  return getRpc().request["auth:loginWithPat"]({ token });
}

export async function detectGhCli(): Promise<{ available: boolean; user?: string; reason?: string }> {
  return getRpc().request["auth:detectGhCli"]();
}

export async function loginWithGhCli(): Promise<{ success: boolean; user?: string; error?: string }> {
  return getRpc().request["auth:loginWithGhCli"]();
}

export async function locateGhCli(): Promise<{ success: boolean; user?: string; token?: string; error?: string }> {
  return getRpc().request["auth:locateGhCli"]();
}

export async function getOrgs(): Promise<string[]> {
  return getRpc().request["auth:getOrgs"]();
}

export function onAuthComplete(cb: (result: { success: boolean; user?: string; error?: string }) => void) {
  getRpc().addMessageListener("auth:complete", (result: any) => cb(result));
}

export function onAuthExpired(cb: () => void) {
  getRpc().addMessageListener("auth:expired", () => cb());
}

export async function loadMeta(): Promise<Meta> {
  return getRpc().request["data:getMeta"]();
}

export async function loadAllRepos(): Promise<RepoData[]> {
  return getRpc().request["data:getAllRepos"]();
}

export async function startCrawl(opts?: { org?: string; since?: string; until?: string; force?: boolean }) {
  return getRpc().request["crawl:start"](opts ?? {});
}

export async function stopCrawl() {
  return getRpc().request["crawl:stop"]();
}

export async function getCrawlStatus(): Promise<{ running: boolean }> {
  return getRpc().request["crawl:status"]();
}

export function onCrawlLog(cb: (msg: string) => void) {
  getRpc().addMessageListener("crawl:log", (payload: any) => cb(payload.msg));
}

export function onCrawlRepoComplete(cb: (repo: string) => void) {
  getRpc().addMessageListener("crawl:repoComplete", (payload: any) => cb(payload.repo));
}

export function onCrawlProgress(cb: (current: number, total: number) => void) {
  getRpc().addMessageListener("crawl:progress", (payload: any) => cb(payload.current, payload.total));
}

export async function exportAIContext(content: string, filePath?: string): Promise<{ ok: boolean; path: string }> {
  return getRpc().request["data:exportAIContext"]({ content, path: filePath });
}
export async function getContextFiles(): Promise<{ dir: string; found: string[] }> {
  return getRpc().request["data:contextFiles"]({});
}

export function onCrawlDone(cb: (result: { success: boolean; error?: string }) => void) {
  getRpc().addMessageListener("crawl:done", (result: any) => cb(result));
}

export async function checkForUpdate(): Promise<any> {
  return getRpc().request["updater:check"]({});
}
export async function downloadUpdate(): Promise<any> {
  return getRpc().request["updater:download"]({});
}
export function onUpdaterStatus(cb: (entry: any) => void) {
  return getRpc().addMessageListener("updater:status", cb);
}
export async function applyUpdate(): Promise<any> {
  return getRpc().request["updater:apply"]({});
}
export async function getLocalInfo(): Promise<{ version: string; channel: string }> {
  return getRpc().request["updater:localInfo"]({});
}

export function writeClipboard(text: string) {
  return getRpc().request["clipboard:write"]({ text });
}

export async function getReviewSignatures(): Promise<{ emoji: string; pattern: string; label: string }[]> {
  return getRpc().request["config:reviewSignatures"]();
}