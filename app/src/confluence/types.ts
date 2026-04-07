export interface ConfluencePage {
  id: string;
  title: string;
  space: string;
  type: "page" | "blogpost";
  category: string;
  created: string;
  updated: string;
  isOwner: boolean;
  commentCount: number;
  commentsGiven: number;
  labels: string[];
  ancestors: string[];
  url: string;
}

export interface ConfluenceMeta {
  site: string;
  since: string;
  until: string;
  crawled_at: string;
  totalPages: number;
}

export interface ConfluenceData {
  meta: ConfluenceMeta;
  pages: ConfluencePage[];
  commentsGiven: number;
}
