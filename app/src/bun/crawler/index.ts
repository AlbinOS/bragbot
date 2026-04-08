import path from "node:path";
import { getToken, apiFetch, setLogFn } from "./github";
import { searchAuthoredPRs, searchReviewedPRs, extractRepoFullName } from "./search";
import { buildRepoData } from "./enrich";
import { mergeRepoData, loadJson, saveJson } from "./merge";

export interface CrawlOptions {
  org: string;
  user?: string;
  since?: string;
  until?: string;
  months?: number;
  dataDir: string;
  force?: boolean;
  onLog: (msg: string) => void;
  onRepoComplete: (repo: string) => void;
  onProgress?: (current: number, total: number) => void;
  signal?: AbortSignal;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function crawl(opts: CrawlOptions): Promise<void> {
  const { org, dataDir, force = false, onLog, onRepoComplete, onProgress, signal } = opts;
  const start = Date.now();

  await getToken();

  let user = opts.user;
  if (!user) {
    const resp = await apiFetch("https://api.github.com/user", undefined, false, signal);
    user = (await resp.json()).login;
    onLog(`Detected user: ${user}`);
  }

  const until = opts.until ?? fmt(new Date());
  const since = opts.since ?? fmt(new Date(Date.now() - (opts.months ?? 6) * 30 * 86400000));

  setLogFn(onLog);
  onLog(`Crawling ${org} for ${user} from ${since} to ${until}`);

  // Determine which ranges actually need searching
  const prevMeta = loadJson(path.join(dataDir, org, "_meta.json"));
  const searchRanges: [string, string][] = [];
  if (force || !prevMeta || !prevMeta.since || !prevMeta.until) {
    searchRanges.push([since, until]);
  } else {
    if (since < prevMeta.since) searchRanges.push([since, prevMeta.since]);
    if (until > prevMeta.until) searchRanges.push([prevMeta.until, until]);
  }

  if (searchRanges.length === 0) {
    onLog("All data already available for this range.");
    return;
  }

  let authored: any[] = [];
  let reviewed: any[] = [];
  for (const [s, u] of searchRanges) {
    onLog(`Searching range: ${s} → ${u}`);
    authored.push(...await searchAuthoredPRs(org, user!, s, u, onLog, signal));
    reviewed.push(...await searchReviewedPRs(org, user!, s, u, onLog, signal));
  }
  onLog(`Total authored PRs: ${authored.length}`);
  onLog(`Total reviewed PRs: ${reviewed.length}`);

  // Group by repo
  const repos = new Map<string, { authored: any[]; reviewed: any[] }>();
  for (const pr of authored) {
    const repo = extractRepoFullName(pr);
    if (!repos.has(repo)) repos.set(repo, { authored: [], reviewed: [] });
    repos.get(repo)!.authored.push(pr);
  }
  for (const pr of reviewed) {
    const repo = extractRepoFullName(pr);
    if (!repos.has(repo)) repos.set(repo, { authored: [], reviewed: [] });
    repos.get(repo)!.reviewed.push(pr);
  }

  onLog(`Repos to process: ${repos.size}`);

  // Count total PRs for progress tracking
  let totalPRs = 0;
  for (const prs of repos.values()) totalPRs += prs.authored.length + prs.reviewed.length;
  let processedPRs = 0;
  onLog(`Total PRs to enrich: ${totalPRs}`);

  const outDir = path.join(dataDir, org);
  const existingMeta = loadJson(path.join(outDir, "_meta.json")) ?? {};

  const meta = {
    org,
    user,
    since: since < (existingMeta.since ?? since) ? since : (existingMeta.since ?? since),
    until: until > (existingMeta.until ?? until) ? until : (existingMeta.until ?? until),
    crawled_at: new Date().toISOString(),
    repos: [...new Set([...repos.keys(), ...(existingMeta.repos ?? [])])].sort(),
    total_authored_prs: authored.length,
    total_reviewed_prs: reviewed.length,
  };
  saveJson(path.join(outDir, "_meta.json"), meta);

  let repoIdx = 0;
  const repoTotal = repos.size;
  for (const [repo, prs] of [...repos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    repoIdx++;
    signal?.throwIfAborted();
    const repoShort = repo.split("/")[1];
    const outFile = path.join(outDir, `${repoShort}.json`);
    const existing = loadJson(outFile);

    if (existing && !force) {
      onLog(`[${repoIdx}/${repoTotal}] Merging into ${repo} (${prs.authored.length} authored, ${prs.reviewed.length} reviewed)`);
      const newData = await buildRepoData(repo, prs.authored, prs.reviewed, user!, onLog, signal, undefined, () => { processedPRs++; onProgress?.(processedPRs, totalPRs); });
      const { merged, newAuthored, newReviewed } = mergeRepoData(existing, newData, since, until);
      if (newAuthored === 0 && newReviewed === 0) {
        onLog(`  No new PRs for ${repo}, skipping`);
        continue;
      }
      saveJson(outFile, merged);
      onLog(`  Merged ${newAuthored} authored + ${newReviewed} reviewed`);
    } else {
      onLog(`[${repoIdx}/${repoTotal}] Processing ${repo} (${prs.authored.length} authored, ${prs.reviewed.length} reviewed)`);
      const data = await buildRepoData(repo, prs.authored, prs.reviewed, user!, onLog, signal, undefined, () => { processedPRs++; onProgress?.(processedPRs, totalPRs); });
      data.meta = { since, until };
      saveJson(outFile, data);
      onLog(`Saved ${repoShort}.json`);
    }
    onRepoComplete(repo);
  }

  const elapsed = (Date.now() - start) / 1000;
  onLog(`Done! Took ${(elapsed / 60).toFixed(1)} minutes (${Math.round(elapsed)}s)`);
}
