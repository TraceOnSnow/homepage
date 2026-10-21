import { type LibraryWork, WORK_STATUSES, WORK_TYPES, type WorkStatus, type WorkType } from './types';

export const LIBRARY_SORTS = ['experienced', 'recorded', 'oldest', 'rating', 'title'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

export interface LibraryViewState {
  type: WorkType | 'all';
  status: WorkStatus | 'all';
  reflections: boolean;
  sort: LibrarySort;
  q: string;
  page: number;
}

export const DEFAULT_LIBRARY_VIEW: LibraryViewState = {
  type: 'all',
  status: 'all',
  reflections: false,
  sort: 'experienced',
  q: '',
  page: 1,
};

export function readLibraryView(params: URLSearchParams): LibraryViewState {
  const type = params.get('type');
  const status = params.get('status');
  const sort = params.get('sort');
  const page = Number(params.get('page'));
  return {
    type: WORK_TYPES.includes(type as WorkType) ? (type as WorkType) : 'all',
    status: WORK_STATUSES.includes(status as WorkStatus) ? (status as WorkStatus) : 'all',
    reflections: params.get('reflections') === '1',
    sort: LIBRARY_SORTS.includes(sort as LibrarySort) ? (sort as LibrarySort) : 'experienced',
    q: params.get('q') ?? '',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

/** Keep unrelated query parameters (and the caller's hash) when changing the shelf. */
export function writeLibraryView(params: URLSearchParams, view: LibraryViewState): URLSearchParams {
  const result = new URLSearchParams(params);
  for (const key of ['type', 'status', 'sort', 'q', 'page', 'reflections'] as const) {
    const value = String(view[key]);
    if (view[key] === DEFAULT_LIBRARY_VIEW[key]) result.delete(key);
    else result.set(key, key === 'reflections' ? '1' : value);
  }
  return result;
}

export function matchesLibraryQuery(work: LibraryWork, query: string): boolean {
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const text = normalize([work.title, work.note, ...work.articles.map((article) => article.title)].filter(Boolean).join(' '));
  return terms.every((term) => text.includes(term));
}

export function hasReflection(work: LibraryWork): boolean {
  return Boolean(work.note?.trim() || work.articles.length > 0);
}

export function displayDate(work: LibraryWork): string | undefined {
  return work.experiencedAt ?? work.recordedAt;
}

export function sortLibraryWorks(works: LibraryWork[], sort: LibrarySort = 'experienced'): LibraryWork[] {
  const timestamp = (value?: string) => {
    const time = value ? Date.parse(value) : 0;
    return Number.isFinite(time) ? time : 0;
  };
  const title = (a: LibraryWork, b: LibraryWork) =>
    a.title.localeCompare(b.title, 'zh-Hans-CN') || a.slug.localeCompare(b.slug);
  return [...works].sort((a, b) => {
    if (sort === 'title') return title(a, b);
    if (sort === 'rating') return (b.rating ?? -1) - (a.rating ?? -1) || title(a, b);
    if (sort === 'recorded') return timestamp(b.recordedAt) - timestamp(a.recordedAt) || title(a, b);
    // Unknown dates stay last in either chronological direction.
    const dateA = timestamp(displayDate(a));
    const dateB = timestamp(displayDate(b));
    if (!dateA || !dateB) return (dateB ? 1 : 0) - (dateA ? 1 : 0) || title(a, b);
    return (sort === 'oldest' ? dateA - dateB : dateB - dateA) || title(a, b);
  });
}

export function formatLibraryDate(value: string, locale: string, timeZone: string): string {
  // Calendar dates retain their authored precision, with no timezone shift or invented day.
  if (/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return value;
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(
    new Date(value),
  );
}
