import type { ConfluenceData, ConfluencePage } from "./types";
import type { Initiative } from "../clusterInitiatives";

// ── Helpers ──

const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "this", "that", "into", "api", "team", "commerce"]);

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function similarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap++;
  return overlap / Math.min(ta.size, tb.size);
}

// ── Page collapser ──

interface PageThread {
  pages: ConfluencePage[];
  title: string;
  category: string;
  space: string;
  commentCount: number;
  isOfficial: boolean;
  linkedInitiatives: string[];
  signals: string[];
}

export function collapsePages(pages: ConfluencePage[]): PageThread[] {
  const used = new Set<string>();
  const threads: PageThread[] = [];
  const sorted = [...pages].sort((a, b) => b.commentCount - a.commentCount);

  for (const page of sorted) {
    if (used.has(page.id)) continue;
    const group = [page];
    used.add(page.id);

    for (const other of sorted) {
      if (used.has(other.id)) continue;
      // Require ≥70% token overlap AND same category to collapse
      if (page.category === other.category && similarity(page.title, other.title) >= 0.7) {
        group.push(other);
        used.add(other.id);
      }
    }

    const best = group[0];
    // Official = any page in the group has a deep ancestor chain (team space)
    const isOfficial = group.some(p => p.ancestors.length > 2);
    threads.push({
      pages: group,
      title: best.title,
      category: best.category,
      space: isOfficial ? group.find(p => p.ancestors.length > 2)!.space : best.space,
      commentCount: group.reduce((s, p) => s + p.commentCount, 0),
      isOfficial,
      linkedInitiatives: [],
      signals: [],
    });
  }
  return threads;
}

// ── Initiative linker (strict: title tokens only, ≥3 overlap, capped at 5) ──

const MAX_LINKS = 5;

export function linkToInitiatives(threads: PageThread[], initiatives: Initiative[]): void {
  for (const thread of threads) {
    // Only use page title tokens — ancestors are too generic
    const titleTokens = new Set(thread.pages.flatMap(p => tokenize(p.title)));

    const scored: { id: string; score: number }[] = [];
    for (const init of initiatives) {
      const initTokens = new Set(tokenize(init.title));
      let overlap = 0;
      for (const w of titleTokens) if (initTokens.has(w)) overlap++;
      // Require ≥2 matching tokens AND ≥50% of page title tokens match
      if (overlap >= 2 && overlap / titleTokens.size >= 0.5) scored.push({ id: init.id, score: overlap });
    }

    // Take top N by score
    scored.sort((a, b) => b.score - a.score);
    thread.linkedInitiatives = scored.slice(0, MAX_LINKS).map(s => s.id);
  }
}

// ── Role signal detection ──

const SIGNAL_MAP: Record<string, string[]> = {
  rfc: ["project_leadership", "architecture", "technical_community_influence"],
  design_doc: ["project_leadership", "documentation", "architecture"],
  adr: ["architecture", "decision_making", "documentation"],
  knowledge_sharing: ["technical_community_influence", "knowledge_sharing", "process_improvement"],
};

function detectSignals(thread: PageThread): string[] {
  const signals = new Set(SIGNAL_MAP[thread.category] || ["documentation"]);
  if (thread.commentCount >= 5) signals.add("collaborative_design");
  if (thread.isOfficial) signals.add("team_visibility");
  return [...signals];
}

// ── Main export ──

export interface ConfluenceDerived {
  coverage: { since: string; until: string; official_pages: number; draft_pages: number; comments_given: number };
  by_category: Record<string, number>;
  threads: {
    title: string;
    category: string;
    space: string;
    comment_count: number;
    is_official: boolean;
    page_count: number;
    linked_initiatives: string[];
    signals: string[];
    urls: string[];
  }[];
}

export function buildConfluenceDerived(data: ConfluenceData, initiatives: Initiative[]): ConfluenceDerived {
  const threads = collapsePages(data.pages);
  linkToInitiatives(threads, initiatives);
  for (const t of threads) t.signals = detectSignals(t);

  const byCategory: Record<string, number> = {};
  // Only count official pages in category breakdown
  for (const p of data.pages) {
    if (p.ancestors.length > 2) byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  }

  const officialCount = data.pages.filter(p => p.ancestors.length > 2).length;

  return {
    coverage: {
      since: data.meta.since,
      until: data.meta.until,
      official_pages: officialCount,
      draft_pages: data.pages.length - officialCount,
      comments_given: data.commentsGiven ?? 0,
    },
    by_category: byCategory,
    threads: threads
      .filter(t => t.isOfficial || t.commentCount > 0) // drop personal drafts with no engagement
      .map(t => ({
        title: t.title,
        category: t.category,
        space: t.space,
        comment_count: t.commentCount,
        is_official: t.isOfficial,
        page_count: t.pages.length,
        linked_initiatives: t.linkedInitiatives,
        signals: t.signals,
        urls: t.pages.map(p => p.url),
      })),
  };
}
