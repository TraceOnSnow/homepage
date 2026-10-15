import type { LibraryWork } from './types';

export const LIBRARY_SORTS = ['experienced', 'recorded', 'oldest', 'rating', 'title'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

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
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(
    new Date(value),
  );
}
