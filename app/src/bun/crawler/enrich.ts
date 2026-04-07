import { apiFetch, paginate } from "./github";

const API = "https://api.github.com";
const DEFAULT_IGNORE_EXTENSIONS = new Set([".csv", ".lock", ".svg", ".snap"]);

async function fetchPRDetails(repo: string, num: number, signal?: AbortSignal) {
  const resp = await apiFetch(`${API}/repos/${repo}/pulls/${num}`, undefined, false, signal);
  if (!resp.ok) return {};
  const d = await resp.json();
  return {
    additions: d.additions ?? 0,
    deletions: d.deletions ?? 0,
    changed_files: d.changed_files ?? 0,
    merged: d.merged ?? false,
    merged_at: d.merged_at,
    state: d.state,
    branch: d.head?.ref ?? "",
  };
}

async function fetchPRFiles(repo: string, num: number, signal?: AbortSignal) {
  const files = await paginate(`${API}/repos/${repo}/pulls/${num}/files`, undefined, false, signal);
  return files.map((f: any) => ({
    filename: f.filename,
    additions: f.additions ?? 0,
    deletions: f.deletions ?? 0,
    status: f.status,
  }));
}

async function fetchReviews(repo: string, num: number, signal?: AbortSignal) {
  const reviews = await paginate(`${API}/repos/${repo}/pulls/${num}/reviews`, undefined, false, signal);
  return reviews.map((r: any) => ({
    user: r.user?.login ?? null,
    state: r.state,
    submitted_at: r.submitted_at,
    body: r.body ?? "",
  }));
}

async function fetchReviewComments(repo: string, num: number, signal?: AbortSignal) {
  const comments = await paginate(`${API}/repos/${repo}/pulls/${num}/comments`, undefined, false, signal);
  return comments.map((c: any) => ({
    user: c.user?.login ?? null,
    created_at: c.created_at,
    body_length: (c.body ?? "").length,
    body: c.body ?? "",
  }));
}

export async function buildRepoData(
  repo: string,
  authoredPRs: any[],
  reviewedPRs: any[],
  user: string,
  onLog: (msg: string) => void,
  signal?: AbortSignal,
  ignoreExtensions = DEFAULT_IGNORE_EXTENSIONS,
) {
  const data: any = {
    repo,
    crawled_at: new Date().toISOString(),
    user,
    authored_prs: [],
    reviewed_prs: [],
  };

  for (const pr of authoredPRs) {
    signal?.throwIfAborted();
    const num = pr.number;
    onLog(`  Fetching authored PR: ${repo}#${num}`);
    const [details, reviews, comments, files] = await Promise.all([
      fetchPRDetails(repo, num, signal),
      fetchReviews(repo, num, signal),
      fetchReviewComments(repo, num, signal),
      fetchPRFiles(repo, num, signal),
    ]);

    const isIgnored = (fn: string) => [...ignoreExtensions].some((ext) => fn.endsWith(ext));
    const filteredAdditions = files.filter((f: any) => !isIgnored(f.filename)).reduce((s: number, f: any) => s + f.additions, 0);
    const filteredDeletions = files.filter((f: any) => !isIgnored(f.filename)).reduce((s: number, f: any) => s + f.deletions, 0);
    const filteredFiles = files.filter((f: any) => !isIgnored(f.filename)).length;

    data.authored_prs.push({
      number: num,
      title: pr.title,
      body: pr.body ?? "",
      created_at: pr.created_at,
      closed_at: pr.closed_at,
      html_url: pr.html_url,
      ...details,
      files,
      filtered_additions: filteredAdditions,
      filtered_deletions: filteredDeletions,
      filtered_files: filteredFiles,
      reviews,
      review_comments: comments,
    });
  }

  for (const pr of reviewedPRs) {
    signal?.throwIfAborted();
    const num = pr.number;
    onLog(`  Fetching reviewed PR: ${repo}#${num}`);
    const [reviews, comments] = await Promise.all([
      fetchReviews(repo, num, signal),
      fetchReviewComments(repo, num, signal),
    ]);
    data.reviewed_prs.push({
      number: num,
      title: pr.title,
      author: pr.user?.login ?? "unknown",
      created_at: pr.created_at,
      html_url: pr.html_url,
      my_reviews: reviews.filter((r: any) => r.user === user),
      my_review_comments: comments.filter((c: any) => c.user === user),
    });
  }

  return data;
}
