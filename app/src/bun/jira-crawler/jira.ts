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

export async function jiraFetch(path: string, opts?: { method?: string; body?: any }): Promise<any> {
  const url = `https://${site}/rest/api/3${path}`;
  const res = await fetch(url, {
    method: opts?.method ?? "GET",
    headers: {
      Authorization: `Basic ${btoa(`${email}:${token}`)}`,
      Accept: "application/json",
      ...(opts?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  if (!res.ok) throw new Error(`Jira API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function jiraSearchAll(
  jql: string,
  fields: string[],
  expand: string,
  onProgress?: (count: number) => void,
  signal?: AbortSignal,
): Promise<any[]> {
  const results: any[] = [];
  let nextPageToken: string | undefined;

  while (true) {
    if (signal?.aborted) throw new Error("Aborted");
    const body: any = { jql, fields, expand, maxResults: 50 };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const data = await jiraFetch("/search/jql", { method: "POST", body });
    results.push(...data.issues);
    onProgress?.(results.length);

    if (data.isLast !== false || !data.nextPageToken) break;
    nextPageToken = data.nextPageToken;
  }
  return results;
}
