import { paginate } from "./github";

const API = "https://api.github.com";

function monthlyWindows(since: string, until: string): [string, string][] {
  const windows: [string, string][] = [];
  let cursor = new Date(since);
  const end = new Date(until);
  while (cursor < end) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const windowEnd = next > end ? end : next;
    windows.push([fmt(cursor), fmt(windowEnd)]);
    cursor = next;
  }
  return windows;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dedup(prs: any[]): any[] {
  const seen = new Set<string>();
  return prs.filter((pr) => {
    if (seen.has(pr.html_url)) return false;
    seen.add(pr.html_url);
    return true;
  });
}

export function extractRepoFullName(pr: any): string {
  const parts = pr.html_url.split("/");
  return `${parts[3]}/${parts[4]}`;
}

export async function searchAuthoredPRs(
  org: string, user: string, since: string, until: string,
  onLog: (msg: string) => void, signal?: AbortSignal,
): Promise<any[]> {
  const all: any[] = [];
  for (const [wSince, wUntil] of monthlyWindows(since, until)) {
    const q = `type:pr author:${user} org:${org} created:${wSince}..${wUntil}`;
    onLog(`Searching PRs: ${q}`);
    const items = await paginate(`${API}/search/issues`, { q }, true, signal);
    all.push(...items);
    onLog(`  Found ${items.length} PRs in ${wSince}..${wUntil}`);
  }
  return dedup(all);
}

export async function searchReviewedPRs(
  org: string, user: string, since: string, until: string,
  onLog: (msg: string) => void, signal?: AbortSignal,
): Promise<any[]> {
  const all: any[] = [];
  for (const [wSince, wUntil] of monthlyWindows(since, until)) {
    const q = `type:pr reviewed-by:${user} -author:${user} org:${org} created:${wSince}..${wUntil}`;
    onLog(`Searching reviews: ${q}`);
    const items = await paginate(`${API}/search/issues`, { q }, true, signal);
    all.push(...items);
    onLog(`  Found ${items.length} reviewed PRs in ${wSince}..${wUntil}`);
  }
  return dedup(all);
}
