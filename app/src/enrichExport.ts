import type { AuthoredPR, ReviewedPR, RepoData } from "./types";
import type { JiraData } from "./jira/types";
import { computeMergeTime, computeReviewStyle, computeReviewTurnaround, computeTopReviewers, computeRepoSummaries, computeMergeTimeTrend, computeReviewCommentTags } from "./stats";

// ── Jira key extraction ──

const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/g;

export function extractJiraKeys(pr: AuthoredPR | ReviewedPR): string[] {
  const text = [pr.title, "body" in pr ? pr.body : "", "branch" in pr ? pr.branch : ""].join(" ");
  const keys = new Set<string>();
  for (const m of text.matchAll(JIRA_KEY_RE)) keys.add(m[1]);
  return [...keys];
}

// ── Work type classification ──

const WORK_TYPE_MAP: Record<string, string> = {
  feat: "feature", feature: "feature",
  fix: "fix", bug: "fix", bugfix: "fix", hotfix: "fix",
  refactor: "refactor", rename: "refactor", cleanup: "refactor",
  chore: "chore", deps: "chore",
  docs: "docs", doc: "docs",
  test: "test", tests: "test",
  ci: "infra", infra: "infra",
  perf: "perf",
  revert: "revert",
};

export function classifyWorkType(pr: AuthoredPR): string {
  const branch = (pr.branch ?? "").toLowerCase();
  const prefix = branch.split(/[\/\-]/)[0];
  if (WORK_TYPE_MAP[prefix]) return WORK_TYPE_MAP[prefix];

  const title = pr.title.toLowerCase();
  if (title.startsWith("revert")) return "revert";
  if (/\bfeat(\(|:|\b)/.test(title)) return "feature";
  if (/\bfix(es|ed)?(\(|:|\b)/.test(title)) return "fix";
  if (/\brefactor/.test(title)) return "refactor";
  if (/\bdoc(s)?(\(|:|\b)/.test(title)) return "docs";
  if (/\btest/.test(title)) return "test";
  if (/\bchore(\(|:|\b)/.test(title)) return "chore";
  if (/\b(ci|infra|terraform|deploy|pipeline)\b/.test(title)) return "infra";
  if (/\b(perf|optim|speed|latency)\b/.test(title)) return "perf";
  if (/\b(add|support|implement|introduce|enable)\b/.test(title)) return "feature";
  if (/\b(remov|delet|deprecat|clean|drop)\b/.test(title)) return "chore";
  if (/\b(updat|upgrad|bump|migrat)\b/.test(title)) return "chore";

  return "other";
}

// ── Derived metrics ──

export interface DerivedMetrics {
  period: { since: string; until: string };
  prs: {
    authored: number;
    merged: number;
    closed_unmerged: number;
    open: number;
    merge_rate: number;
    median_cycle_time_hours: number | null;
    p90_cycle_time_hours: number | null;
    revert_count: number;
  };
  reviewed_prs: {
    total_prs_reviewed: number;
    review_submissions_written: number;
    review_comments_written: number;
    approval_rate: number;
    changes_requested_rate: number;
    avg_comments_per_review: number;
    avg_comment_length: number;
    unique_authors_reviewed: number;
    comment_tags: Record<string, number>;
    repos_reviewed_outside_home: string[];
  };
  jira: {
    issues: number;
    story_points: number;
    story_points_coverage: number;
    by_status: Record<string, number>;
  } | null;
  work_mix: Record<string, number>;
  repo_breadth: {
    total_authored_repos: number;
    total_reviewed_repos: number;
    total_reviewed_repos_outside_home: number;
  };
  top_repo_concentration: { repo: string; authored: number; reviewed: number }[];
  top_inbound_reviewers: { name: string; count: number }[];
  merge_time_trend: { month: string; medianHours: number }[];
  review_turnaround_trend: { month: string; medianHours: number }[];
}

export function computeDerivedMetrics(
  repos: RepoData[],
  user: string,
  since: string,
  until: string,
  jira?: JiraData | null,
): DerivedMetrics {
  const allAuthored = repos.flatMap((r) => r.authored_prs);
  const mergeTime = computeMergeTime(repos);
  const reviewStyle = computeReviewStyle(repos);
  const workCats: Record<string, number> = {};
  for (const r of repos) {
    for (const pr of r.authored_prs) {
      const t = classifyWorkType(pr);
      workCats[t] = (workCats[t] ?? 0) + 1;
    }
  }
  const repoSummaries = computeRepoSummaries(repos);
  const topReviewers = computeTopReviewers(repos, user);
  const mergeTimeTrend = computeMergeTimeTrend(repos);
  const reviewTurnaround = computeReviewTurnaround(repos, user);

  const merged = allAuthored.filter((p) => p.merged).length;
  const closedUnmerged = allAuthored.filter((p) => !p.merged && p.state === "closed").length;
  const open = allAuthored.filter((p) => p.state === "open").length;
  const revertCount = allAuthored.filter((p) => p.title.toLowerCase().startsWith("revert")).length;

  // Unique authors reviewed — count distinct PR authors from reviewed PRs
  const reviewedAuthors = new Set<string>();
  for (const r of repos) {
    for (const pr of r.reviewed_prs) {
      if ("author" in pr && pr.author && pr.author !== "unknown") reviewedAuthors.add(pr.author);
    }
  }

  // Outbound review stats
  let reviewSubmissions = 0, reviewCommentsWritten = 0;
  for (const r of repos) {
    for (const pr of r.reviewed_prs) {
      reviewSubmissions += pr.my_reviews.length;
      reviewCommentsWritten += pr.my_review_comments.length;
    }
  }

  // Comment tag breakdown (given)
  const tagData = computeReviewCommentTags(repos);
  const commentTags: Record<string, number> = {};
  for (const t of tagData) commentTags[t.tag] = t.count;

  // Repos reviewed outside home (reviewed but barely authored)
  const homeThreshold = 5;
  const reposReviewedOutsideHome: string[] = [];
  for (const r of repoSummaries) {
    if (r.reviewed > 0 && r.authored < homeThreshold) reposReviewedOutsideHome.push(r.repo);
  }

  let jiraMetrics: DerivedMetrics["jira"] = null;
  if (jira && jira.issues.length > 0) {
    const byStatus: Record<string, number> = {};
    let sp = 0, spCount = 0;
    for (const issue of jira.issues) {
      byStatus[issue.status] = (byStatus[issue.status] ?? 0) + 1;
      if (issue.storyPoints != null) { sp += issue.storyPoints; spCount++; }
    }
    jiraMetrics = {
      issues: jira.issues.length,
      story_points: sp,
      story_points_coverage: Math.round((spCount / jira.issues.length) * 100),
      by_status: byStatus,
    };
  }

  return {
    period: { since, until },
    prs: {
      authored: allAuthored.length,
      merged,
      closed_unmerged: closedUnmerged,
      open,
      merge_rate: allAuthored.length ? Math.round((merged / allAuthored.length) * 100) : 0,
      median_cycle_time_hours: mergeTime ? Math.round(mergeTime.median * 10) / 10 : null,
      p90_cycle_time_hours: mergeTime ? Math.round(mergeTime.p90 * 10) / 10 : null,
      revert_count: revertCount,
    },
    reviewed_prs: {
      total_prs_reviewed: reviewStyle.totalReviewed,
      review_submissions_written: reviewSubmissions,
      review_comments_written: reviewCommentsWritten,
      approval_rate: reviewStyle.approvalRate,
      changes_requested_rate: reviewStyle.changesRequestedRate,
      avg_comments_per_review: reviewStyle.avgCommentsPerReview,
      avg_comment_length: reviewStyle.avgCommentLength,
      unique_authors_reviewed: reviewedAuthors.size,
      comment_tags: commentTags,
      repos_reviewed_outside_home: reposReviewedOutsideHome,
    },
    jira: jiraMetrics,
    work_mix: workCats,
    repo_breadth: {
      total_authored_repos: repoSummaries.filter((r) => r.authored > 0).length,
      total_reviewed_repos: repoSummaries.filter((r) => r.reviewed > 0).length,
      total_reviewed_repos_outside_home: reposReviewedOutsideHome.length,
    },
    top_repo_concentration: repoSummaries.slice(0, 10).map((r) => ({ repo: r.repo, authored: r.authored, reviewed: r.reviewed })),
    top_inbound_reviewers: topReviewers,
    merge_time_trend: mergeTimeTrend,
    review_turnaround_trend: reviewTurnaround,
  };
}
