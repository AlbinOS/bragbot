const API = "https://api.github.com";
const SEARCH_RATE_FLOOR = 3;
const CORE_RATE_FLOOR = 50;
const PER_PAGE = 100;

let token: string | null = null;

export function setToken(t: string) {
  token = t;
}

export async function getToken(): Promise<string> {
  if (token) return token;
  // Fallback to gh CLI for backwards compat
  const proc = Bun.spawn(["gh", "auth", "token"], { stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) throw new Error("Not authenticated — please sign in via the app");
  token = out.trim();
  return token;
}

function headers(): Record<string, string> {
  return {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function waitForRateLimit(resp: Response, isSearch: boolean) {
  const remaining = parseInt(resp.headers.get("X-RateLimit-Remaining") ?? "999");
  const resetTs = parseInt(resp.headers.get("X-RateLimit-Reset") ?? "0");
  const floor = isSearch ? SEARCH_RATE_FLOOR : CORE_RATE_FLOOR;
  if (remaining < floor) {
    const wait = Math.max(resetTs - Math.floor(Date.now() / 1000), 5) + 2;
    await Bun.sleep(wait * 1000);
  }
}

export class TokenExpiredError extends Error {
  constructor() { super("Token expired — please sign in again"); }
}

export async function apiFetch(
  url: string,
  params?: Record<string, string>,
  isSearch = false,
  signal?: AbortSignal,
): Promise<Response> {
  const u = new URL(url);
  if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);

  for (let attempt = 0; attempt < 5; attempt++) {
    signal?.throwIfAborted();
    const resp = await fetch(u.toString(), { headers: headers(), signal });
    if (resp.status === 401) throw new TokenExpiredError();
    if ((resp.status === 403 || resp.status === 429) && (await resp.text()).toLowerCase().includes("rate limit")) {
      const resetTs = parseInt(resp.headers.get("X-RateLimit-Reset") ?? "0");
      const wait = Math.max(resetTs - Math.floor(Date.now() / 1000), 5) + 2;
      await Bun.sleep(wait * 1000);
      continue;
    }
    await waitForRateLimit(resp, isSearch);
    return resp;
  }
  // last attempt, return whatever we get
  return fetch(u.toString(), { headers: headers(), signal });
}

export async function paginate(
  url: string,
  params?: Record<string, string>,
  isSearch = false,
  signal?: AbortSignal,
): Promise<any[]> {
  const p = { ...params, per_page: String(PER_PAGE) };
  let currentUrl: string | null = url;
  let currentParams: Record<string, string> | undefined = p;
  const results: any[] = [];

  while (currentUrl) {
    signal?.throwIfAborted();
    const resp = await apiFetch(currentUrl, currentParams, isSearch, signal);
    if (!resp.ok) break;
    const data = await resp.json();
    if (data && typeof data === "object" && "items" in data) {
      results.push(...data.items);
    } else {
      results.push(...data);
    }
    currentUrl = null;
    currentParams = undefined;
    const link = resp.headers.get("Link") ?? "";
    for (const part of link.split(",")) {
      if (part.includes('rel="next"')) {
        currentUrl = part.split("<")[1].split(">")[0];
      }
    }
  }
  return results;
}
