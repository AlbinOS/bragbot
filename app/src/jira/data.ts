import type { JiraData } from "./types";

function getRpc(): any {
  return (window as any).__electrobun?.rpc;
}

export async function getJiraAuthStatus(): Promise<{ authenticated: boolean; email?: string; site?: string }> {
  return getRpc().request["jira:auth:status"]();
}

export async function saveJiraAuth(email: string, token: string, site: string): Promise<{ success: boolean; error?: string }> {
  return getRpc().request["jira:auth:save"]({ email, token, site });
}

export async function detectJiraEnv(): Promise<{ available: boolean; site?: string; email?: string; hasToken?: boolean }> {
  return getRpc().request["jira:auth:detectEnv"]();
}

export async function loginWithJiraEnv(): Promise<{ success: boolean; error?: string }> {
  return getRpc().request["jira:auth:loginWithEnv"]();
}

export async function jiraLogout() {
  return getRpc().request["jira:auth:logout"]();
}

export async function getJiraData(): Promise<JiraData | null> {
  return getRpc().request["jira:data:get"]();
}

export async function startJiraCrawl(opts?: { since?: string; until?: string }) {
  return getRpc().request["jira:crawl:start"](opts ?? {});
}

export async function stopJiraCrawl() {
  return getRpc().request["jira:crawl:stop"]();
}

export function onJiraCrawlLog(cb: (msg: string) => void) {
  getRpc().addMessageListener("jira:crawl:log", (payload: any) => cb(payload.msg));
}

export function onJiraCrawlProgress(cb: (current: number, total: number) => void) {
  getRpc().addMessageListener("jira:crawl:progress", (payload: any) => cb(payload.current, payload.total));
}

export function onJiraCrawlDone(cb: (result: { success: boolean; error?: string }) => void) {
  getRpc().addMessageListener("jira:crawl:done", (result: any) => cb(result));
}
