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
  /** 云: experienced secondhand (someone else's playthrough or a recap), independent of status. */
  cloud?: boolean;
  rating?: number;
  year?: string;
  recordedAt?: string;
  experiencedAt?: string;
  coverUrl?: string;
  sourceUrl?: string;
  note?: string;
  articles: ArticleLink[];
  articleId?: number | string;
}

/** Types where a status says nothing: a film or a board game is simply experienced. */
export const STATUSLESS_TYPES: readonly WorkType[] = ['movie', 'boardgame'];

export function showsStatus(type: WorkType | 'all'): boolean {
  return type === 'all' || !STATUSLESS_TYPES.includes(type);
}

/** Translation key for a status, using the type's own word for "completed" (通关, 追完, 读完). */
export function statusLabelKey(status: WorkStatus, type: WorkType | 'all') {
  if (status === 'completed' && (type === 'game' || type === 'anime' || type === 'tv' || type === 'book')) {
    return `library.completed.${type}` as const;
  }
  return `library.${status}` as const;
}
