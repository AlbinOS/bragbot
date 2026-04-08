import { isNetworkError, REQUEST_TIMEOUT_MS, MAX_RETRIES } from "../shared/network";

let email = "";
let token = "";
let site = "";

export function setJiraCredentials(e: string, t: string, s: string) {
  email = e;
  token = t;
  site = s;
}

export function getJiraSite() { return site; }

let storyPointsFields: string[] = [];

export function getStoryPointsFields() { return storyPointsFields; }

export async function detectStoryPointsFields(): Promise<string[]> {
  if (storyPointsFields.length) return storyPointsFields;
  const fields = await jiraFetch("/field");
  const candidates = fields.filter((f: any) => /story.?point/i.test(f.name));
  // Put "estimate" variants first
  candidates.sort((a: any, b: any) => (/estimate/i.test(b.name) ? 1 : 0) - (/estimate/i.test(a.name) ? 1 : 0));
  storyPointsFields = candidates.map((f: any) => f.id);
  return storyPointsFields;
}

export async function jiraFetch(path: string, opts?: { method?: string; body?: any; signal?: AbortSignal }): Promise<any> {
  const url = `https://${site}/rest/api/3${path}`;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    opts?.signal?.throwIfAborted();
    try {
      const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const combined = opts?.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal;
      const res = await fetch(url, {
        method: opts?.method ?? "GET",
        headers: {
          Authorization: `Basic ${btoa(`${email}:${token}`)}`,
          Accept: "application/json",
          ...(opts?.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
        signal: combined,
      });
      if (res.status === 429) {
        const wait = parseInt(res.headers.get("Retry-After") ?? "10");
        await Bun.sleep(wait * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`Jira API ${res.status}: ${await res.text()}`);
      return res.json();
    } catch (e: unknown) {
      opts?.signal?.throwIfAborted();
      if (isNetworkError(e) && attempt < MAX_RETRIES - 1) {
        await Bun.sleep((attempt + 1) * 3000);
        continue;
      }
      throw e;
    }
  }
  throw new Error("Jira API: max retries exceeded");
}

export async function jiraSearchAll(
  jql: string,
  fields: string[],
  expand: string,
  onProgress?: (count: number, total: number) => void,
  signal?: AbortSignal,
): Promise<any[]> {
  const results: any[] = [];
  let nextPageToken: string | undefined;
  let total = 0;

  while (true) {
    if (signal?.aborted) throw new Error("Aborted");
    const body: any = { jql, fields, expand, maxResults: 50 };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const data = await jiraFetch("/search/jql", { method: "POST", body, signal });
    results.push(...data.issues);
    if (data.total) total = data.total;
    onProgress?.(results.length, total);

    if (data.isLast !== false || !data.nextPageToken) break;
    nextPageToken = data.nextPageToken;
  }
  return results;
}
