import type { AuthoredPR, RepoData, ReviewedPR } from "./types";

// ── Helpers to prefer filtered line counts ──

function adds(pr: AuthoredPR): number { return pr.filtered_additions ?? pr.additions; }
function dels(pr: AuthoredPR): number { return pr.filtered_deletions ?? pr.deletions; }
function files(pr: AuthoredPR): number { return pr.filtered_files ?? pr.changed_files; }

// ── Grouping helpers ──

function weekKey(d: Date): string {
  // ISO week: get Thursday of the week, then compute week number
  const tmp = new Date(d);
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const jan4 = new Date(tmp.getFullYear(), 0, 4);
  const week = 1 + Math.round(((tmp.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${tmp.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Aggregation ──

export interface WeeklyPoint {
  week: string;
  authored: number;
  reviewed: number;
}

export interface MonthlyPoint {
  month: string;
  authored: number;
  reviewed: number;
  additions: number;
  deletions: number;
}

export interface RepoSummary {
  repo: string;
  authored: number;
  reviewed: number;
  additions: number;
  deletions: number;
  rawAdditions: number;
  rawDeletions: number;
  approvals: number;
  reviewComments: number;
}

export interface Totals {
  authored: number;
  merged: number;
  reviewed: number;
  additions: number;
  deletions: number;
  changedFiles: number;
  approvalsGiven: number;
  inlineComments: number;
}

export interface SizeBucket {
  name: string;
  count: number;
}

export interface MergeTimeStats {
  median: number;
  p90: number;
  avg: number;
  min: number;
  max: number;
}

export function computeTotals(repos: RepoData[]): Totals {
  let authored = 0, merged = 0, reviewed = 0, additions = 0, deletions = 0, changedFiles = 0, approvalsGiven = 0, inlineComments = 0;
  for (const r of repos) {
    for (const pr of r.authored_prs) {
      authored++;
      if (pr.merged) merged++;
      additions += adds(pr);
      deletions += dels(pr);
      changedFiles += files(pr);
    }
    for (const pr of r.reviewed_prs) {
      reviewed++;
      approvalsGiven += pr.my_reviews.filter(rv => rv.state === "APPROVED").length;
      inlineComments += pr.my_review_comments.length;
    }
  }
  return { authored, merged, reviewed, additions, deletions, changedFiles, approvalsGiven, inlineComments };
}

export function computeWeekly(repos: RepoData[], since?: string, until?: string): WeeklyPoint[] {
  const map = new Map<string, { authored: number; reviewed: number }>();

  // Pre-fill all weeks in range
  if (since && until) {
    const d = new Date(since);
    const end = new Date(until);
    while (d <= end) {
      const w = weekKey(d);
      if (!map.has(w)) map.set(w, { authored: 0, reviewed: 0 });
      d.setDate(d.getDate() + 7);
    }
  }

  for (const r of repos) {
    for (const pr of r.authored_prs) {
      const w = weekKey(new Date(pr.created_at));
      const e = map.get(w) ?? { authored: 0, reviewed: 0 };
      e.authored++;
      map.set(w, e);
    }
    for (const pr of r.reviewed_prs) {
      const dates = pr.my_reviews.filter(rv => rv.submitted_at).map(rv => new Date(rv.submitted_at!));
      const dt = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : new Date(pr.created_at);
      const w = weekKey(dt);
      const e = map.get(w) ?? { authored: 0, reviewed: 0 };
      e.reviewed++;
      map.set(w, e);
    }
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, v]) => ({ week, ...v }));
}

export function computeMonthly(repos: RepoData[], since?: string, until?: string): MonthlyPoint[] {
  const map = new Map<string, MonthlyPoint>();

  // Pre-fill all months in range
  if (since && until) {
    const d = new Date(since);
    const end = new Date(until);
    while (d <= end) {
      const m = monthKey(d);
      if (!map.has(m)) map.set(m, { month: m, authored: 0, reviewed: 0, additions: 0, deletions: 0 });
      d.setMonth(d.getMonth() + 1);
    }
  }

  for (const r of repos) {
    for (const pr of r.authored_prs) {
      const m = monthKey(new Date(pr.created_at));
      const e = map.get(m) ?? { month: m, authored: 0, reviewed: 0, additions: 0, deletions: 0 };
      e.authored++;
      e.additions += adds(pr);
      e.deletions += dels(pr);
      map.set(m, e);
    }
    for (const pr of r.reviewed_prs) {
      const dates = pr.my_reviews.filter(rv => rv.submitted_at).map(rv => new Date(rv.submitted_at!));
      const dt = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : new Date(pr.created_at);
      const m = monthKey(dt);
      const e = map.get(m) ?? { month: m, authored: 0, reviewed: 0, additions: 0, deletions: 0 };
      e.reviewed++;
      map.set(m, e);
    }
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function computeRepoSummaries(repos: RepoData[]): RepoSummary[] {
  return repos
    .map(r => {
      const repo = r.repo.split("/").pop()!;
      const additions = r.authored_prs.reduce((s, p) => s + adds(p), 0);
      const deletions = r.authored_prs.reduce((s, p) => s + dels(p), 0);
      const rawAdditions = r.authored_prs.reduce((s, p) => s + p.additions, 0);
      const rawDeletions = r.authored_prs.reduce((s, p) => s + p.deletions, 0);
      const approvals = r.reviewed_prs.reduce((s, p) => s + p.my_reviews.filter(rv => rv.state === "APPROVED").length, 0);
      const reviewComments = r.reviewed_prs.reduce((s, p) => s + p.my_review_comments.length, 0);
      return { repo, authored: r.authored_prs.length, reviewed: r.reviewed_prs.length, additions, deletions, rawAdditions, rawDeletions, approvals, reviewComments };
    })
    .filter(r => r.authored > 0 || r.reviewed > 0)
    .sort((a, b) => (b.authored + b.reviewed) - (a.authored + a.reviewed));
}

export function computeSizeBuckets(repos: RepoData[]): SizeBucket[] {
  const buckets: Record<string, number> = { "XS (<10)": 0, "S (10-50)": 0, "M (50-200)": 0, "L (200-500)": 0, "XL (500+)": 0 };
  for (const r of repos) {
    for (const pr of r.authored_prs) {
      const total = adds(pr) + dels(pr);
      if (total < 10) buckets["XS (<10)"]++;
      else if (total < 50) buckets["S (10-50)"]++;
      else if (total < 200) buckets["M (50-200)"]++;
      else if (total < 500) buckets["L (200-500)"]++;
      else buckets["XL (500+)"]++;
    }
  }
  return Object.entries(buckets).map(([name, count]) => ({ name, count }));
}

export function computeMergeTime(repos: RepoData[]): MergeTimeStats | null {
  const hours: number[] = [];
  for (const r of repos) {
    for (const pr of r.authored_prs) {
      if (pr.merged && pr.created_at && pr.merged_at) {
        const h = (new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime()) / 3600000;
        if (h >= 0) hours.push(h);
      }
    }
  }
  if (!hours.length) return null;
  hours.sort((a, b) => a - b);
  return {
    median: hours[Math.floor(hours.length / 2)],
    p90: hours[Math.floor(hours.length * 0.9)],
    avg: hours.reduce((a, b) => a + b, 0) / hours.length,
    min: hours[0],
    max: hours[hours.length - 1],
  };
}

export function computeTopReviewers(repos: RepoData[], user: string): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of repos) {
    for (const pr of r.authored_prs) {
      for (const rv of pr.reviews) {
        if (rv.user && rv.user !== user && !rv.user.endsWith("[bot]")) {
          counts.set(rv.user, (counts.get(rv.user) ?? 0) + 1);
        }
      }
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => ({ name, count }));
}

// ── Day of week activity ──

export interface DayOfWeekPoint {
  day: string;
  authored: number;
  reviewed: number;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function computeDayOfWeek(repos: RepoData[]): DayOfWeekPoint[] {
  const counts = DAY_NAMES.map(day => ({ day, authored: 0, reviewed: 0 }));
  for (const r of repos) {
    for (const pr of r.authored_prs) counts[new Date(pr.created_at).getDay()].authored++;
    for (const pr of r.reviewed_prs) {
      const dates = pr.my_reviews.filter(rv => rv.submitted_at).map(rv => new Date(rv.submitted_at!));
      const dt = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : new Date(pr.created_at);
      counts[dt.getDay()].reviewed++;
    }
  }
  return counts;
}

// ── Review turnaround time (time to first review on your PRs) ──

export interface TurnaroundPoint {
  month: string;
  medianHours: number;
}

export function computeReviewTurnaround(repos: RepoData[], user: string): TurnaroundPoint[] {
  const byMonth = new Map<string, number[]>();
  for (const r of repos) {
    for (const pr of r.authored_prs) {
      const firstReview = pr.reviews
        .filter(rv => rv.submitted_at && rv.user !== user)
        .map(rv => new Date(rv.submitted_at!).getTime())
        .sort((a, b) => a - b)[0];
      if (!firstReview) continue;
      const hours = (firstReview - new Date(pr.created_at).getTime()) / 3600000;
      if (hours < 0) continue;
      const m = monthKey(new Date(pr.created_at));
      byMonth.set(m, [...(byMonth.get(m) ?? []), hours]);
    }
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, hours]) => {
      hours.sort((a, b) => a - b);
      return { month, medianHours: Math.round(hours[Math.floor(hours.length / 2)] * 10) / 10 };
    });
}

// ── Your review style ──

export interface ReviewStyle {
  totalReviewed: number;
  approvalRate: number;
  avgCommentsPerReview: number;
  avgCommentLength: number;
  changesRequestedRate: number;
}

export function computeReviewStyle(repos: RepoData[]): ReviewStyle {
  let totalReviewed = 0, approvals = 0, changesRequested = 0, totalComments = 0, totalLength = 0;
  for (const r of repos) {
    for (const pr of r.reviewed_prs) {
      totalReviewed++;
      if (pr.my_reviews.some(rv => rv.state === "APPROVED")) approvals++;
      if (pr.my_reviews.some(rv => rv.state === "CHANGES_REQUESTED")) changesRequested++;
      totalComments += pr.my_review_comments.length;
      totalLength += pr.my_review_comments.reduce((s, c) => s + c.body_length, 0);
    }
  }
  return {
    totalReviewed,
    approvalRate: totalReviewed ? Math.round(approvals / totalReviewed * 100) : 0,
    avgCommentsPerReview: totalReviewed ? Math.round(totalComments / totalReviewed * 10) / 10 : 0,
    avgCommentLength: totalComments ? Math.round(totalLength / totalComments) : 0,
    changesRequestedRate: totalReviewed ? Math.round(changesRequested / totalReviewed * 100) : 0,
  };
}

// ── Merge time trend ──

export interface MergeTimeTrend {
  month: string;
  medianHours: number;
}

export function computeMergeTimeTrend(repos: RepoData[]): MergeTimeTrend[] {
  const byMonth = new Map<string, number[]>();
  for (const r of repos) {
    for (const pr of r.authored_prs) {
      if (!pr.merged || !pr.merged_at) continue;
      const hours = (new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime()) / 3600000;
      if (hours < 0) continue;
      const m = monthKey(new Date(pr.created_at));
      byMonth.set(m, [...(byMonth.get(m) ?? []), hours]);
    }
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, hours]) => {
      hours.sort((a, b) => a - b);
      return { month, medianHours: Math.round(hours[Math.floor(hours.length / 2)] * 10) / 10 };
    });
}

// ── PR size vs merge time scatter ──

export interface SizeVsMergePoint {
  size: number;
  hours: number;
  title: string;
  url: string;
}

export function computeSizeVsMerge(repos: RepoData[]): SizeVsMergePoint[] {
  const points: SizeVsMergePoint[] = [];
  for (const r of repos) {
    for (const pr of r.authored_prs) {
      if (!pr.merged || !pr.merged_at) continue;
      const hours = Math.round((new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime()) / 3600000 * 10) / 10;
      if (hours < 0) continue;
      points.push({ size: adds(pr) + dels(pr), hours, title: pr.title, url: pr.html_url });
    }
  }
  return points;
}

// ── Collaboration network ──

export interface CollaborationData {
  names: string[];
  matrix: number[][];
}

export function computeCollaboration(repos: RepoData[], user: string): CollaborationData {
  // Count: who reviewed your PRs (them→you) and whose PRs you reviewed (you→them)
  const reviewedYou = new Map<string, number>();
  const youReviewed = new Map<string, number>();

  for (const r of repos) {
    for (const pr of r.authored_prs) {
      const seen = new Set<string>();
      for (const rv of pr.reviews) {
        if (rv.user && rv.user !== user && !rv.user.endsWith("[bot]") && !seen.has(rv.user)) {
          reviewedYou.set(rv.user, (reviewedYou.get(rv.user) ?? 0) + 1);
          seen.add(rv.user);
        }
      }
    }
    for (const pr of r.reviewed_prs) {
      for (const rv of pr.my_reviews) {
        // Each unique PR we reviewed counts as 1 interaction
        // We don't know the author, but we can use review_comments to find them
      }
    }
  }

  // Merge both directions, take top 8
  const all = new Map<string, { in: number; out: number }>();
  for (const [name, count] of reviewedYou) {
    const e = all.get(name) ?? { in: 0, out: 0 };
    e.in = count;
    all.set(name, e);
  }

  const top = [...all.entries()]
    .sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out))
    .slice(0, 8);

  if (top.length === 0) return { names: [], matrix: [] };

  const names = [user, ...top.map(([n]) => n)];
  const n = names.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (const [name, { in: fromThem }] of top) {
    const j = names.indexOf(name);
    matrix[j][0] = fromThem; // them reviewing you
    matrix[0][j] = fromThem; // symmetric
  }

  return { names, matrix };
}

export interface WorkCategory { name: string; count: number; }

export function computeWorkCategories(repos: RepoData[]): WorkCategory[] {
  const cats: Record<string, number> = {};
  for (const r of repos) {
    for (const pr of r.authored_prs) {
      const branch = pr.branch ?? "";
      const prefix = branch.split(/[\/\-]/)[0].toLowerCase();
      const cat = ({ feat: "Feature", fix: "Fix", bug: "Fix", bugfix: "Fix", hotfix: "Hotfix", chore: "Chore", refactor: "Refactor", docs: "Docs", test: "Test", ci: "CI", perf: "Perf", style: "Style", revert: "Revert", release: "Release" } as Record<string, string>)[prefix] ?? "Other";
      cats[cat] = (cats[cat] ?? 0) + 1;
    }
  }
  return Object.entries(cats).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

// ── Review comment tag breakdown ──

const TAG_RE = /^\*{0,2}(\w[\w-]*?)(?:\((.*?)\))?:\*{0,2}/m;
const KNOWN_TAGS = new Set(["question", "suggestion", "issue", "note", "praise", "nit", "nitpick", "thought", "request", "concern", "idea", "blocker"]);

const TAG_ALIASES: Record<string, string> = { nitpick: "nit", "nit-pick": "nit" };

export interface ReviewTagCount { tag: string; count: number; }

export function computeReviewCommentTags(repos: RepoData[]): ReviewTagCount[] {
  const freq = new Map<string, number>();
  const countTag = (body: string) => {
    const m = (body ?? "").match(TAG_RE);
    if (!m) return;
    const primary = m[1].trim().toLowerCase();
    const qualifier = (m[2] ?? "").trim().toLowerCase();
    // Count primary tag
    if (KNOWN_TAGS.has(primary)) {
      const tag = TAG_ALIASES[primary] ?? primary;
      freq.set(tag, (freq.get(tag) ?? 0) + 1);
    }
    // Also count qualifier if it's a known tag (e.g. suggestion(nitpick))
    if (qualifier && KNOWN_TAGS.has(qualifier) && qualifier !== primary) {
      const tag = TAG_ALIASES[qualifier] ?? qualifier;
      freq.set(tag, (freq.get(tag) ?? 0) + 1);
    }
  };
  for (const r of repos) {
    for (const pr of r.reviewed_prs) {
      for (const c of pr.my_review_comments) countTag(c.body);
      for (const rv of pr.my_reviews) countTag(rv.body);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));
}

export function computeReceivedCommentTags(repos: RepoData[]): ReviewTagCount[] {
  const freq = new Map<string, number>();
  const countTag = (body: string) => {
    const m = (body ?? "").match(TAG_RE);
    if (!m) return;
    const primary = m[1].trim().toLowerCase();
    const qualifier = (m[2] ?? "").trim().toLowerCase();
    if (KNOWN_TAGS.has(primary)) {
      const tag = TAG_ALIASES[primary] ?? primary;
      freq.set(tag, (freq.get(tag) ?? 0) + 1);
    }
    if (qualifier && KNOWN_TAGS.has(qualifier) && qualifier !== primary) {
      const tag = TAG_ALIASES[qualifier] ?? qualifier;
      freq.set(tag, (freq.get(tag) ?? 0) + 1);
    }
  };
  for (const r of repos) {
    for (const pr of r.authored_prs) {
      for (const c of (pr as any).review_comments ?? []) countTag(c.body);
      for (const rv of (pr as any).reviews ?? []) countTag(rv.body);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));
}

// ── Fun emoji/reactions in review comments ──

export interface EmojiCount { emoji: string; count: number; }

interface SignaturePattern { emoji: string; pattern: string; label: string }

const DEFAULT_SIGNATURES: SignaturePattern[] = [
  { emoji: "✅", pattern: "\\bLGTM\\b|\\blooks good\\b|\\blooks great\\b", label: "LGTM" },
  { emoji: "🐐", pattern: "🐐|:goat:|(?:^|\\s)goat(?:\\s|$)|(?:^|\\s)GOAT(?:\\s|$)", label: "goat" },
  { emoji: "👍", pattern: "👍|:\\+1:|:thumbsup:", label: "thumbs up" },
  { emoji: "🔥", pattern: "🔥|:fire:", label: "fire" },
  { emoji: "🚀", pattern: "🚀|:rocket:", label: "rocket" },
  { emoji: "🎉", pattern: "🎉|:tada:", label: "tada" },
  { emoji: "💯", pattern: "💯|:100:", label: "100" },
  { emoji: "👀", pattern: "👀|:eyes:", label: "eyes" },
  { emoji: "🤩", pattern: "🤩|:starstruck:", label: "starstruck" },
  { emoji: "❤️", pattern: "❤️|:heart:", label: "heart" },
  { emoji: "😂", pattern: "😂|:joy:", label: "laugh" },
  { emoji: "👑", pattern: "👑|:crown:|:king:", label: "crown" },
];

let _signaturePatterns: [RegExp, string][] | null = null;

export function setReviewSignatures(patterns: SignaturePattern[]) {
  _signaturePatterns = patterns.map((p) => [new RegExp(p.pattern, "i"), `${p.emoji} ${p.label}`]);
}

function getSignaturePatterns(): [RegExp, string][] {
  if (!_signaturePatterns) setReviewSignatures(DEFAULT_SIGNATURES);
  return _signaturePatterns!;
}

export function getDefaultSignatures(): SignaturePattern[] {
  return DEFAULT_SIGNATURES;
}

export function computeReviewEmojis(repos: RepoData[]): EmojiCount[] {
  const patterns = getSignaturePatterns();
  const freq = new Map<string, number>();
  for (const r of repos) {
    for (const pr of r.reviewed_prs) {
      const bodies: string[] = [];
      for (const c of pr.my_review_comments) if (c.body) bodies.push(c.body);
      for (const rv of pr.my_reviews) if (rv.body) bodies.push(rv.body);
      for (const body of bodies) {
        for (const [re, label] of patterns) {
          const matches = body.match(new RegExp(re, "gi"));
          if (matches) freq.set(label, (freq.get(label) ?? 0) + matches.length);
        }
      }
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([emoji, count]) => ({ emoji, count }));
}

export function computeReceivedEmojis(repos: RepoData[]): EmojiCount[] {
  const patterns = getSignaturePatterns();
  const freq = new Map<string, number>();
  for (const r of repos) {
    for (const pr of r.authored_prs) {
      const bodies: string[] = [];
      for (const rv of (pr as any).reviews ?? []) if (rv.body) bodies.push(rv.body);
      for (const c of (pr as any).review_comments ?? []) if (c.body) bodies.push(c.body);
      for (const body of bodies) {
        for (const [re, label] of patterns) {
          const matches = body.match(new RegExp(re, "gi"));
          if (matches) freq.set(label, (freq.get(label) ?? 0) + matches.length);
        }
      }
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([emoji, count]) => ({ emoji, count }));
}
