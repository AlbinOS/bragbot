import { isNetworkError, REQUEST_TIMEOUT_MS, MAX_RETRIES } from "../shared/network";

let email = "";
let token = "";
let site = "";

export function setConfluenceCredentials(e: string, t: string, s: string) {
  email = e;
  token = t;
  site = s;
}

export function getConfluenceSite() { return site; }

export async function confluenceFetch(path: string, signal?: AbortSignal): Promise<any> {
  const url = `https://${site}/wiki/rest/api${path}`;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    signal?.throwIfAborted();
    try {
      const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      const res = await fetch(url, {
        headers: {
          Authorization: `Basic ${btoa(`${email}:${token}`)}`,
          Accept: "application/json",
        },
        signal: combined,
      });
      if (res.status === 429) {
        const wait = parseInt(res.headers.get("Retry-After") ?? "10");
        await Bun.sleep(wait * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`Confluence API ${res.status}: ${await res.text()}`);
      return res.json();
    } catch (e: unknown) {
      signal?.throwIfAborted();
      if (isNetworkError(e) && attempt < MAX_RETRIES - 1) {
        await Bun.sleep((attempt + 1) * 3000);
        continue;
      }
      throw e;
    }
  }
  throw new Error("Confluence API: max retries exceeded");
}

export async function confluenceCqlSearch(
  cql: string,
  expand: string,
  onProgress?: (count: number, total: number) => void,
  signal?: AbortSignal,
): Promise<any[]> {
  const results: any[] = [];
  let start = 0;
  const limit = 50;

  while (true) {
    if (signal?.aborted) throw new Error("Aborted");
    const params = new URLSearchParams({ cql, expand, start: String(start), limit: String(limit) });
    const data = await confluenceFetch(`/content/search?${params}`, signal);
    results.push(...data.results);
    onProgress?.(results.length, data.totalSize ?? results.length);

    if (results.length >= data.totalSize || data.results.length < limit) break;
    start += limit;
  }
  return results;
}

export async function confluenceCurrentUser(): Promise<string> {
  const data = await confluenceFetch("/user/current");
  return data.accountId;
}

export async function confluenceDescendantComments(pageId: string, signal?: AbortSignal): Promise<any[]> {
  const results: any[] = [];
  let start = 0;
  while (true) {
    const data = await confluenceFetch(`/content/${pageId}/descendant/comment?expand=history&start=${start}&limit=50`, signal);
    results.push(...data.results);
    if (results.length >= data.size || data.results.length < 50) break;
    start += 50;
  }
  return results;
}

export async function confluenceCqlCount(cql: string, signal?: AbortSignal): Promise<number> {
  const params = new URLSearchParams({ cql, limit: "0" });
  const data = await confluenceFetch(`/search?${params}`, signal);
  return data.totalSize ?? 0;
}
