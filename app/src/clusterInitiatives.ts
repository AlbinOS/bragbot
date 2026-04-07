import type { RepoData, AuthoredPR } from "./types";
import type { JiraIssue } from "./jira/types";
import { extractJiraKeys, classifyWorkType } from "./enrichExport";

export interface Initiative {
  id: string;
  title: string;
  theme: string;
  repos: string[];
  prs: { repo: string; number: number; title: string; status: string; work_type: string; additions: number; deletions: number }[];
  jira_keys: string[];
  start: string;
  end: string;
  status: string;
  shipped_prs: number;
  attempted_prs: number;
  open_prs: number;
  reverted_count: number;
  confidence: "high" | "medium" | "low";
}

interface PRNode {
  repo: string;
  pr: AuthoredPR;
  jiraKeys: string[];
  workType: string;
}

// ── Union-Find with merge-rule tracking ──

function makeUF(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const rank = new Array(n).fill(0);
  const strength = new Array(n).fill(0); // 0=none, 3=jira, 2=revert, 1=branch
  function find(x: number): number { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
  function union(a: number, b: number, s: number) {
    const ra = find(a), rb = find(b);
    if (ra === rb) { strength[ra] = Math.max(strength[ra], s); return; }
    if (rank[ra] < rank[rb]) { parent[ra] = rb; strength[rb] = Math.max(strength[rb], strength[ra], s); }
    else if (rank[ra] > rank[rb]) { parent[rb] = ra; strength[ra] = Math.max(strength[ra], strength[rb], s); }
    else { parent[rb] = ra; rank[ra]++; strength[ra] = Math.max(strength[ra], strength[rb], s); }
  }
  function getStrength(x: number): number { return strength[find(x)]; }
  return { find, union, getStrength };
}

const REVERT_RE = /^revert\b.*#(\d+)/i;
function detectRevertTarget(title: string): number | null {
  const m = title.match(REVERT_RE);
  return m ? parseInt(m[1]) : null;
}

function branchPrefix(branch: string): string {
  const parts = branch.split(/[-\/]/);
  return parts.slice(0, Math.min(3, parts.length)).join("-").toLowerCase();
}

// ── Theme classification ──

function classifyTheme(workTypes: Record<string, number>): string {
  const sorted = Object.entries(workTypes).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0]?.[0] ?? "other";
  const themeMap: Record<string, string> = {
    feature: "feature", fix: "reliability", chore: "cleanup",
    refactor: "cleanup", infra: "infrastructure", test: "testing",
    docs: "documentation", revert: "reliability", perf: "performance",
  };
  return themeMap[dominant] ?? "other";
}

export interface NotableSingleton {
  repo: string;
  number: number;
  title: string;
  url: string;
  work_type: string;
  status: string;
  jira_keys: string[];
  lines_changed: number;
  additions: number;
  deletions: number;
  reviewer_count: number;
  review_comment_count: number;
  signals: string[];
}

export interface ClusterResult {
  initiatives: Initiative[];
  notable_singletons: NotableSingleton[];
}

// ── Clustering ──

export function clusterInitiatives(repos: RepoData[], jiraIssues?: JiraIssue[]): ClusterResult {
  const nodes: PRNode[] = [];
  for (const r of repos) {
    for (const pr of r.authored_prs) {
      nodes.push({ repo: r.repo, pr, jiraKeys: extractJiraKeys(pr), workType: classifyWorkType(pr) });
    }
  }
  if (nodes.length === 0) return { initiatives: [], notable_singletons: [] };

  const uf = makeUF(nodes.length);

  // Index by Jira key
  const byJiraKey = new Map<string, number[]>();
  for (let i = 0; i < nodes.length; i++) {
    for (const key of nodes[i].jiraKeys) {
      const list = byJiraKey.get(key) ?? [];
      list.push(i);
      byJiraKey.set(key, list);
    }
  }

  // 1. Merge PRs sharing a Jira key (high confidence)
  for (const indices of byJiraKey.values()) {
    for (let i = 1; i < indices.length; i++) uf.union(indices[0], indices[i], 3);
  }

  // 2. Merge reverts with their targets (medium confidence)
  const byRepoNumber = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) {
    byRepoNumber.set(`${nodes[i].repo}#${nodes[i].pr.number}`, i);
  }
  for (let i = 0; i < nodes.length; i++) {
    const target = detectRevertTarget(nodes[i].pr.title);
    if (target != null) {
      const j = byRepoNumber.get(`${nodes[i].repo}#${target}`);
      if (j != null) uf.union(i, j, 2);
    }
  }

  // 3. Merge same-repo PRs with similar branch prefix within 14 days (low confidence)
  const byRepoBranch = new Map<string, number[]>();
  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i].pr.branch) continue;
    const key = `${nodes[i].repo}::${branchPrefix(nodes[i].pr.branch)}`;
    const list = byRepoBranch.get(key) ?? [];
    list.push(i);
    byRepoBranch.set(key, list);
  }
  for (const indices of byRepoBranch.values()) {
    if (indices.length < 2) continue;
    indices.sort((a, b) => nodes[a].pr.created_at.localeCompare(nodes[b].pr.created_at));
    for (let i = 1; i < indices.length; i++) {
      const days = (new Date(nodes[indices[i]].pr.created_at).getTime() - new Date(nodes[indices[i - 1]].pr.created_at).getTime()) / 86400000;
      if (days <= 14) uf.union(indices[i - 1], indices[i], 1);
    }
  }

  // Build clusters
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < nodes.length; i++) {
    const root = uf.find(i);
    const list = clusters.get(root) ?? [];
    list.push(i);
    clusters.set(root, list);
  }

  // Jira issue lookup
  const jiraMap = new Map<string, JiraIssue>();
  if (jiraIssues) for (const issue of jiraIssues) jiraMap.set(issue.key, issue);

  const initiatives: Initiative[] = [];
  for (const [root, indices] of clusters) {
    if (indices.length < 2) continue;

    const prs = indices.map((i) => nodes[i]);
    const allJiraKeys = [...new Set(prs.flatMap((n) => n.jiraKeys))];
    const allRepos = [...new Set(prs.map((n) => n.repo.split("/").pop()!))];
    const dates = prs.map((n) => n.pr.created_at).sort();
    const shipped = prs.filter((n) => n.pr.merged);
    const attempted = prs.filter((n) => !n.pr.merged && n.pr.state === "closed");
    const open = prs.filter((n) => n.pr.state === "open");
    const revertedCount = prs.filter((n) => detectRevertTarget(n.pr.title) != null).length;

    // Title: prefer Jira summary of a merged PR's key, then merged PR title, then any title
    let title = "";
    const mergedKeys = shipped.flatMap((n) => n.jiraKeys);
    for (const key of mergedKeys) {
      const issue = jiraMap.get(key);
      if (issue) { title = `${key}: ${issue.summary}`; break; }
    }
    if (!title) {
      for (const key of allJiraKeys) {
        const issue = jiraMap.get(key);
        if (issue) { title = `${key}: ${issue.summary}`; break; }
      }
    }
    if (!title) {
      // Prefer merged PR titles
      const pool = shipped.length > 0 ? shipped : prs;
      const titles = pool.map((n) => n.pr.title.replace(/^revert\s+"?/i, ""));
      const freq = new Map<string, number>();
      for (const t of titles) freq.set(t, (freq.get(t) ?? 0) + 1);
      title = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }

    // Theme from dominant work type
    const workTypeCounts: Record<string, number> = {};
    for (const n of prs) workTypeCounts[n.workType] = (workTypeCounts[n.workType] ?? 0) + 1;
    const theme = classifyTheme(workTypeCounts);

    // Status
    let status = "in progress";
    if (shipped.length === prs.length) status = "all merged";
    else if (shipped.length > 0 && revertedCount > 0) status = "landed after iteration";
    else if (shipped.length > 0) status = "partially merged";
    else if (prs.every((n) => n.pr.state === "closed")) status = "closed";

    // Confidence from union-find strength
    const s = uf.getStrength(root);
    const confidence: Initiative["confidence"] = s >= 3 ? "high" : s >= 2 ? "medium" : "low";

    initiatives.push({
      id: allJiraKeys[0] ?? `cluster-${initiatives.length}`,
      title,
      theme,
      repos: allRepos,
      prs: prs
        .sort((a, b) => a.pr.created_at.localeCompare(b.pr.created_at))
        .map((n) => ({
          repo: n.repo.split("/").pop()!,
          number: n.pr.number,
          title: n.pr.title,
          status: n.pr.merged ? "merged" : n.pr.state,
          work_type: n.workType,
          additions: n.pr.filtered_additions ?? n.pr.additions,
          deletions: n.pr.filtered_deletions ?? n.pr.deletions,
        })),
      jira_keys: allJiraKeys,
      start: dates[0].slice(0, 10),
      end: dates[dates.length - 1].slice(0, 10),
      status,
      shipped_prs: shipped.length,
      attempted_prs: attempted.length,
      open_prs: open.length,
      reverted_count: revertedCount,
      confidence,
    });
  }

  initiatives.sort((a, b) => b.shipped_prs + b.attempted_prs + b.open_prs - (a.shipped_prs + a.attempted_prs + a.open_prs) || b.repos.length - a.repos.length);

  // Notable singletons: unclustered PRs that match 2+ significance signals
  const clusteredIndices = new Set(Array.from(clusters.values()).filter((v) => v.length >= 2).flat());
  const notable_singletons: NotableSingleton[] = [];

  for (let i = 0; i < nodes.length; i++) {
    if (clusteredIndices.has(i)) continue;
    const n = nodes[i];
    const pr = n.pr;
    const adds = pr.filtered_additions ?? pr.additions;
    const dels = pr.filtered_deletions ?? pr.deletions;
    const lines = adds + dels;
    const reviewers = new Set(pr.reviews.filter((r) => r.user).map((r) => r.user)).size;
    const commentCount = pr.review_comments.length;
    const jiraKeys = n.jiraKeys;

    const signals: string[] = [];
    if (lines > 200) signals.push("large_change");
    if (jiraKeys.length > 0) signals.push("has_jira");
    if (reviewers >= 3) signals.push("many_reviewers");
    if (commentCount >= 5) signals.push("high_discussion");

    if (signals.length >= 2) {
      notable_singletons.push({
        repo: n.repo.split("/").pop()!,
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        work_type: n.workType,
        status: pr.merged ? "merged" : pr.state,
        jira_keys: jiraKeys,
        lines_changed: lines,
        additions: adds,
        deletions: dels,
        reviewer_count: reviewers,
        review_comment_count: commentCount,
        signals,
      });
    }
  }

  notable_singletons.sort((a, b) => b.signals.length - a.signals.length || b.lines_changed - a.lines_changed);

  return { initiatives, notable_singletons };
}
