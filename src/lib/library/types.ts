export const WORK_TYPES = ['game', 'book', 'movie', 'tv', 'anime', 'manga', 'comic', 'boardgame'] as const;
export type WorkType = (typeof WORK_TYPES)[number];
export const WORK_STATUSES = ['planned', 'in-progress', 'completed', 'on-hold', 'dropped'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];
export interface ArticleLink {
  title: string;
  url: string;
}
/** Public display fields only. No backend config, account data, or authored body is shipped. */
export interface LibraryWork {
  id: number | string;
  slug: string;
  title: string;
  type: WorkType;
  status?: WorkStatus;
  rating?: number;
  year?: string;
  coverUrl?: string;
  sourceUrl?: string;
  note?: string;
  articles: ArticleLink[];
}
