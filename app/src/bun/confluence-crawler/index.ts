import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { confluenceCqlSearch, getConfluenceSite, confluenceCurrentUser, confluenceDescendantComments, confluenceCqlCount } from "./confluence";
import type { ConfluencePage, ConfluenceData, ConfluenceMeta } from "../../confluence/types";

const CONFIG_PATH = path.join(os.homedir(), "Library", "Application Support", "BragBot", "confluence-categories.json");

interface CategoryRule { pattern: string; category: string }
interface CategoryConfig {
  titlePatterns?: CategoryRule[];
  ancestorPatterns?: CategoryRule[];
}

const CATEGORY_LABELS: Record<string, string> = {
  rfc: "rfc", "design-doc": "design_doc", "design_doc": "design_doc",
  runbook: "runbook", postmortem: "postmortem", "post-mortem": "postmortem",
  adr: "adr", retrospective: "postmortem",
};

function loadUserConfig(): CategoryConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    // Write default config on first run so users can discover and edit it
    const defaults: CategoryConfig = {
      titlePatterns: [
        { pattern: "\\bRFCs?\\b", category: "rfc" },
        { pattern: "\\bADRs?\\b", category: "adr" },
        { pattern: "decision\\s*(log|record)", category: "adr" },
        { pattern: "proposal", category: "design_doc" },
        { pattern: "design\\s*doc", category: "design_doc" },
        { pattern: "architecture|architectural", category: "design_doc" },
        { pattern: "migration\\s*plan", category: "design_doc" },
        { pattern: "runbook", category: "runbook" },
        { pattern: "monitoring", category: "runbook" },
        { pattern: "post-?mortem", category: "postmortem" },
        { pattern: "incident\\s*review", category: "postmortem" },
        { pattern: "tech\\s*talk", category: "knowledge_sharing" },
        { pattern: "\\bCQRS\\b|\\bDDD\\b", category: "knowledge_sharing" },
        { pattern: "roadmap", category: "planning" },
        { pattern: "preparation|readiness", category: "planning" },
        { pattern: "^\\w+-\\w+-\\w+\\s+\\d{4}-\\d{2}-\\d{2}$", category: "meeting" },
      ],
      ancestorPatterns: [
        { pattern: "\\bRFCs?\\b", category: "rfc" },
        { pattern: "tech\\s*talk", category: "knowledge_sharing" },
        { pattern: "design\\s*doc", category: "design_doc" },
        { pattern: "runbook", category: "runbook" },
        { pattern: "post-?mortem", category: "postmortem" },
        { pattern: "\\bADRs?\\b", category: "adr" },
        { pattern: "decision", category: "adr" },
      ],
    };
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function buildPatterns(config: CategoryConfig) {
  const titlePatterns = (config.titlePatterns ?? []).map(
    (r) => [new RegExp(r.pattern, "i"), r.category] as [RegExp, string],
  );
  const ancestorPatterns = (config.ancestorPatterns ?? []).map(
    (r) => [new RegExp(r.pattern, "i"), r.category] as [RegExp, string],
  );
  return { titlePatterns, ancestorPatterns };
}

function detectCategory(labels: string[], title: string, ancestors: string[], titlePatterns: [RegExp, string][], ancestorPatterns: [RegExp, string][]): string {
  for (const l of labels) {
    const cat = CATEGORY_LABELS[l.toLowerCase()];
    if (cat) return cat;
  }
  // Ancestor patterns first — org structure is more reliable than title heuristics
  for (const a of ancestors) {
    for (const [re, cat] of ancestorPatterns) {
      if (re.test(a)) return cat;
    }
  }
  for (const [re, cat] of titlePatterns) {
    if (re.test(title)) return cat;
  }
  return "other";
}

function parsePage(raw: any, titlePatterns: [RegExp, string][], ancestorPatterns: [RegExp, string][]): ConfluencePage {
  const labels = (raw.metadata?.labels?.results ?? []).map((l: any) => l.name);
  const ancestors = (raw.ancestors ?? []).map((a: any) => a.title);
  const title = raw.title ?? "";
  return {
    id: raw.id,
    title,
    space: raw.space?.name ?? raw.space?.key ?? "Unknown",
    type: raw.type === "blogpost" ? "blogpost" : "page",
    category: detectCategory(labels, title, ancestors, titlePatterns, ancestorPatterns),
    created: raw.history?.createdDate ?? "",
    updated: raw.history?.lastUpdated?.when ?? raw.version?.when ?? "",
    isOwner: true,
    commentCount: raw.children?.comment?.size ?? 0,
    commentsGiven: 0,
    labels,
    ancestors,
    url: `https://${getConfluenceSite()}/wiki/pages/viewpage.action?pageId=${raw.id}`,
  };
}

export async function crawlConfluence(
  opts: { since: string; until: string },
  dataDir: string,
  onLog: (msg: string) => void,
  signal?: AbortSignal,
  onProgress?: (current: number, total: number) => void,
): Promise<ConfluenceData> {
  const expand = "space,history,history.lastUpdated,metadata.labels,ancestors,children.comment,version";
  const config = loadUserConfig();
  const { titlePatterns, ancestorPatterns } = buildPatterns(config);
  onLog(`Loaded ${titlePatterns.length} title patterns, ${ancestorPatterns.length} ancestor patterns`);

  // Pages created by user
  const createdCql = `creator = currentUser() AND type = page AND created >= "${opts.since}" AND created <= "${opts.until}" ORDER BY created DESC`;
  const blogCql = `creator = currentUser() AND type = blogpost AND created >= "${opts.since}" AND created <= "${opts.until}" ORDER BY created DESC`;

  // Get totals upfront for smooth progress
  const [createdTotal, blogTotal] = await Promise.all([
    confluenceCqlCount(createdCql, signal),
    confluenceCqlCount(blogCql, signal),
  ]);
  const grandTotal = createdTotal + blogTotal;
  let fetched = 0;

  onLog(`Searching created pages (${createdTotal} found)`);
  const created = await confluenceCqlSearch(createdCql, expand, (n) => { fetched = n; onLog(`Created pages: ${n}/${createdTotal}`); onProgress?.(fetched, grandTotal); }, signal);

  onLog(`Searching blog posts (${blogTotal} found)`);
  const blogs = await confluenceCqlSearch(blogCql, expand, (n) => { fetched = created.length + n; onLog(`Blog posts: ${n}/${blogTotal}`); onProgress?.(fetched, grandTotal); }, signal);

  const pages = [
    ...created.map((r) => parsePage(r, titlePatterns, ancestorPatterns)),
    ...blogs.map((r) => parsePage(r, titlePatterns, ancestorPatterns)),
  ];

  // Deduplicate by id
  const seen = new Set<string>();
  const deduped = pages.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  onLog(`Total: ${deduped.length} unique pages/posts`);

  // Count comments given (instant — uses totalSize, no pagination)
  const commentCql = `creator = currentUser() AND type = comment AND created >= "${opts.since}" AND created <= "${opts.until}"`;
  const commentsGiven = await confluenceCqlCount(commentCql, signal);
  onLog(`Comments given: ${commentsGiven}`);

  const meta: ConfluenceMeta = {
    site: getConfluenceSite(),
    since: opts.since,
    until: opts.until,
    crawled_at: new Date().toISOString(),
    totalPages: deduped.length,
  };

  const data: ConfluenceData = { meta, pages: deduped, commentsGiven };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "confluence.json"), JSON.stringify(data, null, 2));
  onLog(`Saved ${deduped.length} pages to disk`);

  return data;
}

export function loadConfluenceData(dataDir: string): ConfluenceData | null {
  const filePath = path.join(dataDir, "confluence.json");
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}
