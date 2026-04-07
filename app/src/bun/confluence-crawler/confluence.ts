let email = "";
let token = "";
let site = "";

export function setConfluenceCredentials(e: string, t: string, s: string) {
  email = e;
  token = t;
  site = s;
}

export function getConfluenceSite() { return site; }

export async function confluenceFetch(path: string): Promise<any> {
  const url = `https://${site}/wiki/rest/api${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${btoa(`${email}:${token}`)}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Confluence API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function confluenceCqlSearch(
  cql: string,
  expand: string,
  onProgress?: (count: number) => void,
  signal?: AbortSignal,
): Promise<any[]> {
  const results: any[] = [];
  let start = 0;
  const limit = 50;

  while (true) {
    if (signal?.aborted) throw new Error("Aborted");
    const params = new URLSearchParams({ cql, expand, start: String(start), limit: String(limit) });
    const data = await confluenceFetch(`/content/search?${params}`);
    results.push(...data.results);
    onProgress?.(results.length);

    if (results.length >= data.totalSize || data.results.length < limit) break;
    start += limit;
  }
  return results;
}

export async function confluenceCurrentUser(): Promise<string> {
  const data = await confluenceFetch("/user/current");
  return data.accountId;
}

export async function confluenceDescendantComments(pageId: string): Promise<any[]> {
  const results: any[] = [];
  let start = 0;
  while (true) {
    const data = await confluenceFetch(`/content/${pageId}/descendant/comment?expand=history&start=${start}&limit=50`);
    results.push(...data.results);
    if (results.length >= data.size || data.results.length < 50) break;
    start += 50;
  }
  return results;
}

export async function confluenceCqlCount(cql: string): Promise<number> {
  const params = new URLSearchParams({ cql, limit: "0" });
  const data = await confluenceFetch(`/search?${params}`);
  return data.totalSize ?? 0;
}
