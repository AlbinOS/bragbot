import type { Initiative, NotableSingleton } from "./clusterInitiatives";
import type { DerivedMetrics } from "./enrichExport";

interface EvidenceItem {
  initiative_id: string;
  why: string;
}

export interface RoleEvidence {
  category: string;
  signals: string[];
  evidence: EvidenceItem[];
}

function describeInit(i: Initiative): string {
  const parts = [`${i.shipped_prs} shipped`];
  if (i.repos.length > 1) parts.push(`${i.repos.length} repos`);
  if (i.confidence === "high") parts.push("high confidence");
  parts.push(i.theme);
  return parts.join(", ");
}

export function computeRoleAlignment(
  metrics: DerivedMetrics,
  initiatives: Initiative[],
  singletons: NotableSingleton[],
): RoleEvidence[] {
  const result: RoleEvidence[] = [];

  // ── Project Leadership ──
  const signals_leadership: string[] = [];
  const evidence_leadership: EvidenceItem[] = [];
  const largeInits = initiatives.filter((i) => i.shipped_prs >= 5);
  if (largeInits.length > 0) signals_leadership.push(`${largeInits.length} initiatives with 5+ shipped PRs`);
  const crossRepo = initiatives.filter((i) => i.repos.length >= 2);
  if (crossRepo.length > 0) signals_leadership.push(`${crossRepo.length} cross-repo initiatives`);
  const highConf = initiatives.filter((i) => i.confidence === "high" && i.shipped_prs >= 3);
  if (highConf.length > 0) signals_leadership.push(`${highConf.length} high-confidence initiatives with 3+ shipped PRs`);
  // Top evidence: large + cross-repo + high confidence, sorted by shipped count
  for (const i of [...largeInits].sort((a, b) => b.shipped_prs - a.shipped_prs).slice(0, 5)) {
    evidence_leadership.push({ initiative_id: i.id, why: describeInit(i) });
  }
  if (signals_leadership.length > 0)
    result.push({ category: "project_leadership", signals: signals_leadership, evidence: evidence_leadership });

  // ── Production Ownership ──
  const signals_prod: string[] = [];
  const evidence_prod: EvidenceItem[] = [];
  const reliabilityInits = initiatives.filter((i) => i.theme === "reliability" || i.theme === "performance");
  if (reliabilityInits.length > 0) signals_prod.push(`${reliabilityInits.length} reliability/performance initiatives`);
  for (const i of reliabilityInits.slice(0, 5)) {
    evidence_prod.push({ initiative_id: i.id, why: describeInit(i) });
  }
  const opsRepos = metrics.top_repo_concentration.filter((r) =>
    /ops|grafana|infra|monitor|alert|dashboard/i.test(r.repo) && r.authored > 0
  );
  if (opsRepos.length > 0) signals_prod.push(`Authored PRs in ops/infra repos: ${opsRepos.map((r) => `${r.repo} (${r.authored})`).join(", ")}`);
  if (metrics.prs.revert_count <= 3 && metrics.prs.merged > 100)
    signals_prod.push(`${metrics.prs.revert_count} reverts across ${metrics.prs.merged} merged PRs — low rollback rate`);
  if (signals_prod.length > 0)
    result.push({ category: "production_ownership", signals: signals_prod, evidence: evidence_prod });

  // ── Process Improvement ──
  const signals_process: string[] = [];
  const evidence_process: EvidenceItem[] = [];
  const cleanupInits = initiatives.filter((i) => i.theme === "cleanup");
  if (cleanupInits.length > 0) signals_process.push(`${cleanupInits.length} cleanup/refactor initiatives`);
  const infraInits = initiatives.filter((i) => i.theme === "infrastructure");
  if (infraInits.length > 0) signals_process.push(`${infraInits.length} infrastructure/tooling initiatives`);
  for (const i of [...cleanupInits, ...infraInits].sort((a, b) => b.shipped_prs - a.shipped_prs).slice(0, 5)) {
    evidence_process.push({ initiative_id: i.id, why: describeInit(i) });
  }
  const choreCount = metrics.work_mix["chore"] ?? 0;
  const refactorCount = metrics.work_mix["refactor"] ?? 0;
  if (choreCount + refactorCount > 20)
    signals_process.push(`${choreCount + refactorCount} chore/refactor PRs — sustained maintenance investment`);
  if (signals_process.length > 0)
    result.push({ category: "process_improvement", signals: signals_process, evidence: evidence_process });

  // ── Mentoring & Collaboration ──
  const signals_mentor: string[] = [];
  const reviewed = metrics.reviewed_prs;
  if (reviewed.unique_authors_reviewed >= 10)
    signals_mentor.push(`Reviewed PRs from ${reviewed.unique_authors_reviewed} unique authors`);
  if (reviewed.total_prs_reviewed >= 100)
    signals_mentor.push(`${reviewed.total_prs_reviewed} PRs reviewed with ${reviewed.review_comments_written} inline comments`);
  if (reviewed.review_submissions_written > reviewed.total_prs_reviewed)
    signals_mentor.push(`${reviewed.review_submissions_written} review submissions across ${reviewed.total_prs_reviewed} PRs — follow-up reviews, not just rubber stamps`);
  const reviewRepos = metrics.repo_breadth.total_reviewed_repos;
  if (reviewRepos >= 5)
    signals_mentor.push(`Reviews span ${reviewRepos} repos — cross-team support`);
  if (signals_mentor.length > 0)
    result.push({ category: "mentoring_and_collaboration", signals: signals_mentor, evidence: [] });

  // ── Technical Community Influence ──
  const signals_community: string[] = [];
  const evidence_community: EvidenceItem[] = [];
  const sharedLibRepos = metrics.top_repo_concentration.filter((r) =>
    /commons|shared|lib|client|base|platform|tools/i.test(r.repo) && r.authored > 0
  );
  if (sharedLibRepos.length > 0)
    signals_community.push(`Authored PRs in shared/platform repos: ${sharedLibRepos.map((r) => `${r.repo} (${r.authored})`).join(", ")}`);
  const reposBreadth = metrics.repo_breadth.total_authored_repos;
  if (reposBreadth >= 5)
    signals_community.push(`Authored PRs across ${reposBreadth} repos — broad codebase influence`);
  if (crossRepo.length >= 3)
    signals_community.push(`${crossRepo.length} cross-repo initiatives — driving changes beyond team boundaries`);
  for (const i of crossRepo.sort((a, b) => b.repos.length - a.repos.length).slice(0, 5)) {
    evidence_community.push({ initiative_id: i.id, why: describeInit(i) });
  }
  if (signals_community.length > 0)
    result.push({ category: "technical_community_influence", signals: signals_community, evidence: evidence_community });

  return result;
}
