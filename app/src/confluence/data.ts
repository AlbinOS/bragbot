import type { ConfluenceData } from "./types";

function getRpc(): any {
  return (window as any).__electrobun?.rpc;
}

export async function getConfluenceData(): Promise<ConfluenceData | null> {
  return getRpc().request["confluence:data:get"]();
}

export async function startConfluenceCrawl(opts?: { since?: string; until?: string }) {
  return getRpc().request["confluence:crawl:start"](opts ?? {});
}

export async function stopConfluenceCrawl() {
  return getRpc().request["confluence:crawl:stop"]();
}

export function onConfluenceCrawlLog(cb: (msg: string) => void) {
  getRpc().addMessageListener("confluence:crawl:log", (payload: any) => cb(payload.msg));
}

export function onConfluenceCrawlProgress(cb: (current: number, total: number) => void) {
  getRpc().addMessageListener("confluence:crawl:progress", (payload: any) => cb(payload.current, payload.total));
}

export function onConfluenceCrawlDone(cb: (result: { success: boolean; error?: string }) => void) {
  getRpc().addMessageListener("confluence:crawl:done", (result: any) => cb(result));
}
