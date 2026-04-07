import type { RepoData } from "./types";
import type { JiraData } from "./jira/types";
import { extractJiraKeys, classifyWorkType, computeDerivedMetrics, type DerivedMetrics } from "./enrichExport";
import { clusterInitiatives, type Initiative, type NotableSingleton } from "./clusterInitiatives";
import { computeRoleAlignment, type RoleEvidence } from "./roleAlignment";

export function generateAIContext(
  user: string,
  org: string,
  since: string,
  until: string,
  repos: RepoData[],
  jira?: JiraData | null,
): { markdown: string; metrics: DerivedMetrics; initiatives: Initiative[]; notable_singletons: NotableSingleton[]; role_alignment: RoleEvidence[] } {
  const metrics = computeDerivedMetrics(repos, user, since, until, jira);
  const { initiatives, notable_singletons } = clusterInitiatives(repos, jira?.issues);
  const role_alignment = computeRoleAlignment(metrics, initiatives, notable_singletons);
  const lines: string[] = [];
  const ln = (s = "") => lines.push(s);

  ln("# BragBot Data Export");
  ln();
  ln(`**${user}** in **${org}** — ${since} → ${until}`);
  ln();

  // ── Derived Metrics ──
  ln("## Derived Metrics");
  ln();
  ln("### PRs");
  ln(`- Authored: ${metrics.prs.authored} (${metrics.prs.merged} merged, ${metrics.prs.closed_unmerged} closed unmerged, ${metrics.prs.open} open)`);
  ln(`- Merge rate: ${metrics.prs.merge_rate}%`);
  if (metrics.prs.median_cycle_time_hours != null) ln(`- Median cycle time: ${metrics.prs.median_cycle_time_hours}h`);
  if (metrics.prs.p90_cycle_time_hours != null) ln(`- P90 cycle time: ${metrics.prs.p90_cycle_time_hours}h`);
  if (metrics.prs.revert_count > 0) ln(`- Reverts: ${metrics.prs.revert_count}`);
  ln();
  ln("### Reviewed PRs (outbound reviews)");
  ln(`- PRs reviewed: ${metrics.reviewed_prs.total_prs_reviewed}`);
  ln(`- Review submissions written: ${metrics.reviewed_prs.review_submissions_written}`);
  ln(`- Review comments written: ${metrics.reviewed_prs.review_comments_written}`);
  ln(`- Approval rate: ${metrics.reviewed_prs.approval_rate}%`);
  ln(`- Changes requested rate: ${metrics.reviewed_prs.changes_requested_rate}%`);
  ln(`- Avg comments/review: ${metrics.reviewed_prs.avg_comments_per_review}`);
  ln(`- Unique authors reviewed: ${metrics.reviewed_prs.unique_authors_reviewed}`);
  if (Object.keys(metrics.reviewed_prs.comment_tags).length > 0) {
    ln(`- Comment style: ${Object.entries(metrics.reviewed_prs.comment_tags).map(([k, v]) => `${k} (${v})`).join(", ")}`);
  }
  if (metrics.reviewed_prs.repos_reviewed_outside_home.length > 0) {
    ln(`- Reviewed outside home repos: ${metrics.reviewed_prs.repos_reviewed_outside_home.join(", ")}`);
  }
  ln();
  ln("### Work Mix");
  for (const [type, count] of Object.entries(metrics.work_mix)) {
    ln(`- ${type}: ${count}`);
  }
  ln();
  ln("### Repo Breadth");
  ln(`- Authored in: ${metrics.repo_breadth.total_authored_repos} repos`);
  ln(`- Reviewed in: ${metrics.repo_breadth.total_reviewed_repos} repos (${metrics.repo_breadth.total_reviewed_repos_outside_home} outside home)`);
  ln();
  ln("### Top Repos");
  for (const r of metrics.top_repo_concentration) {
    ln(`- ${r.repo}: ${r.authored} authored, ${r.reviewed} reviewed`);
  }
  ln();
  ln("### Top Inbound Reviewers (people who reviewed your PRs)");
  for (const r of metrics.top_inbound_reviewers.slice(0, 10)) {
    ln(`- ${r.name}: ${r.count}`);
  }
  ln();

  if (metrics.jira) {
    ln("### Jira");
    ln(`- Issues: ${metrics.jira.issues}`);
    ln(`- Story points: ${metrics.jira.story_points} (${metrics.jira.story_points_coverage}% of issues have points)`);
    ln(`- By status: ${Object.entries(metrics.jira.by_status).map(([s, c]) => `${s}: ${c}`).join(", ")}`);
    ln();
  }

  // ── Repos with enriched PRs ──
  // ── Initiatives ──
  if (initiatives.length > 0) {
    ln("## Initiatives");
    ln();
    ln(`${initiatives.length} workstreams detected from ${initiatives.reduce((s, i) => s + i.shipped_prs + i.attempted_prs + i.open_prs, 0)} PRs (singletons omitted).`);
    ln();
    for (const init of initiatives) {
      const jira = init.jira_keys.length ? ` [${init.jira_keys.join(", ")}]` : "";
      ln(`### ${init.title}`);
      ln();
      ln(`- **Theme**: ${init.theme} | **Confidence**: ${init.confidence}`);
      ln(`- **Repos**: ${init.repos.join(", ")}`);
      ln(`- **Period**: ${init.start} → ${init.end}`);
      ln(`- **Status**: ${init.status} — ${init.shipped_prs} shipped, ${init.attempted_prs} attempted, ${init.open_prs} open${init.reverted_count > 0 ? `, ${init.reverted_count} reverts` : ""}${jira}`);
      for (const pr of init.prs) {
        ln(`  - ${pr.repo}#${pr.number}: ${pr.title} (${pr.status}, ${pr.work_type})`);
      }
      ln();
    }
  }

  // ── Notable Singletons ──
  if (notable_singletons.length > 0) {
    ln("## Notable Standalone PRs");
    ln();
    ln(`${notable_singletons.length} unclustered PRs with high significance signals.`);
    ln();
    for (const s of notable_singletons) {
      const jira = s.jira_keys.length ? ` [${s.jira_keys.join(", ")}]` : "";
      ln(`- [#${s.number}: ${s.title}](${s.url}) — ${s.work_type}, ${s.status}, +${s.additions}/-${s.deletions}, ${s.reviewer_count} reviewers, ${s.review_comment_count} comments (${s.signals.join(", ")})${jira}`);
    }
    ln();
  }

  // ── Role Alignment ──
  if (role_alignment.length > 0) {
    ln("## Role Alignment (auto-detected)");
    ln();
    for (const e of role_alignment) {
      ln(`### ${e.category.replace(/_/g, " ")}`);
      for (const s of e.signals) ln(`- ${s}`);
      if (e.evidence.length > 0) {
        ln(`- Evidence:`);
        for (const ev of e.evidence) ln(`  - ${ev.initiative_id}: ${ev.why}`);
      }
      ln();
    }
  }

  ln("## Repositories");
  ln();
  for (const r of repos) {
    const repoUrl = `https://github.com/${r.repo}`;
    ln(`### [${r.repo}](${repoUrl})`);
    ln();
    ln(`Clone: \`git clone ${repoUrl}.git\``);
    ln();

    if (r.authored_prs.length > 0) {
      ln("#### Authored PRs");
      ln();
      for (const pr of r.authored_prs) {
        const size = `+${pr.filtered_additions ?? pr.additions}/-${pr.filtered_deletions ?? pr.deletions}`;
        const jiraKeys = extractJiraKeys(pr);
        const workType = classifyWorkType(pr);
        const jiraStr = jiraKeys.length ? ` [${jiraKeys.join(", ")}]` : "";
        ln(`- [#${pr.number}: ${pr.title}](${pr.html_url}) — ${workType}, ${size}, ${pr.merged ? "merged" : pr.state} ${pr.merged_at?.slice(0, 10) ?? pr.closed_at?.slice(0, 10) ?? ""}${jiraStr}`);
        if (pr.body) ln(`  - ${pr.body.slice(0, 300).replace(/\n/g, " ")}${pr.body.length > 300 ? "..." : ""}`);
      }
      ln();
    }

    if (r.reviewed_prs.length > 0) {
      ln("#### Reviewed PRs");
      ln();
      for (const pr of r.reviewed_prs) {
        const commentCount = pr.my_review_comments?.length ?? 0;
        const jiraKeys = extractJiraKeys(pr);
        const jiraStr = jiraKeys.length ? ` [${jiraKeys.join(", ")}]` : "";
        ln(`- [#${pr.number}: ${pr.title}](${pr.html_url}) — ${pr.my_reviews?.length ?? 0} reviews, ${commentCount} comments${jiraStr}`);
      }
      ln();
    }
  }

  // ── Jira ──
  if (jira && jira.issues.length > 0) {
    ln("## Jira Issues");
    ln();
    const site = jira.meta.site.replace(/\/$/, "");
    for (const issue of jira.issues) {
      const url = `https://${site}/browse/${issue.key}`;
      const sp = issue.storyPoints ? ` (${issue.storyPoints} SP)` : "";
      ln(`- [${issue.key}: ${issue.summary}](${url}) — ${issue.type}, ${issue.status}${sp}`);
    }
    ln();
  }

  return { markdown: lines.join("\n"), metrics, initiatives, notable_singletons, role_alignment };
}
