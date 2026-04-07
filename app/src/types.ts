export interface Meta {
  org: string;
  user: string;
  since: string;
  until: string;
  crawled_at: string;
  repos: string[];
  total_authored_prs: number;
  total_reviewed_prs: number;
}

export interface Review {
  user: string | null;
  state: string;
  submitted_at: string | null;
  body: string;
}

export interface ReviewComment {
  user: string | null;
  created_at: string | null;
  body_length: number;
  body: string;
}

export interface AuthoredPR {
  number: number;
  title: string;
  body: string;
  branch: string;
  created_at: string;
  closed_at: string | null;
  html_url: string;
  additions: number;
  deletions: number;
  changed_files: number;
  merged: boolean;
  merged_at: string | null;
  state: string;
  reviews: Review[];
  review_comments: ReviewComment[];
  filtered_additions?: number;
  filtered_deletions?: number;
  filtered_files?: number;
}

export interface ReviewedPR {
  number: number;
  title: string;
  author: string;
  created_at: string;
  html_url: string;
  my_reviews: Review[];
  my_review_comments: ReviewComment[];
}

export interface RepoData {
  repo: string;
  crawled_at: string;
  user: string;
  authored_prs: AuthoredPR[];
  reviewed_prs: ReviewedPR[];
  meta: { since: string; until: string };
}
