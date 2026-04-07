export interface JiraTransition {
  from: string | null;
  to: string;
  timestamp: string;
}

export interface JiraIssue {
  key: string;
  summary: string;
  type: string;
  priority: string;
  status: string;
  created: string;
  updated: string;
  resolved: string | null;
  storyPoints: number | null;
  labels: string[];
  project: string;
  transitions: JiraTransition[];
  commentCount: number;
}

export interface JiraMeta {
  email: string;
  site: string;
  since: string;
  until: string;
  crawled_at: string;
  totalIssues: number;
}

export interface JiraData {
  meta: JiraMeta;
  issues: JiraIssue[];
}
