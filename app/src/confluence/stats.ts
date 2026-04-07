import type { ConfluencePage } from "./types";

export function computeConfluenceTotals(pages: ConfluencePage[]) {
  return {
    pages: pages.filter((p) => p.type === "page").length,
    blogPosts: pages.filter((p) => p.type === "blogpost").length,
    spaces: new Set(pages.map((p) => p.space)).size,
    totalComments: pages.reduce((s, p) => s + p.commentCount, 0),
  };
}

export function computeByCategory(pages: ConfluencePage[]) {
  const counts: Record<string, number> = {};
  for (const p of pages) {
    counts[p.category] = (counts[p.category] ?? 0) + 1;
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export function computeMonthlyPages(pages: ConfluencePage[], since: string, until: string) {
  const months: Record<string, { pages: number; blogs: number }> = {};
  let d = new Date(since);
  const end = new Date(until);
  while (d <= end) {
    const key = d.toISOString().slice(0, 7);
    months[key] = { pages: 0, blogs: 0 };
    d.setMonth(d.getMonth() + 1);
  }
  for (const p of pages) {
    const key = p.created.slice(0, 7);
    if (!months[key]) continue;
    if (p.type === "blogpost") months[key].blogs++;
    else months[key].pages++;
  }
  return Object.entries(months).map(([month, v]) => ({ month, ...v }));
}

export function computeTopSpaces(pages: ConfluencePage[]) {
  const counts: Record<string, number> = {};
  for (const p of pages) {
    counts[p.space] = (counts[p.space] ?? 0) + 1;
  }
  return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
}

export function computeMostDiscussed(pages: ConfluencePage[]) {
  return [...pages].filter((p) => p.commentCount > 0).sort((a, b) => b.commentCount - a.commentCount).slice(0, 10);
}
