import { LazyMotionProvider } from '@components/common/LazyMotionProvider';
import { useMotionLevel } from '@hooks/useMotionLevel';
import { useTranslation } from '@hooks/useTranslation';
import { Icon } from '@iconify/react';
import { type LibraryWork, WORK_TYPES, type WorkStatus, type WorkType } from '@lib/library/types';
import { hasReflection, LIBRARY_SORTS, type LibrarySort, sortLibraryWorks } from '@lib/library/view';
import { getScrollBehavior } from '@lib/motion-level';
import { cn } from '@lib/utils';
import { AnimatePresence, m } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import type { TranslationKey } from '@/i18n/types';
import { ITEMS_PER_PAGE } from '@/lib/bangumi/constants';
import { LibraryCard } from './LibraryCard';

const FILTER_OPTIONS: Array<{ key: WorkStatus | 'all'; labelKey: TranslationKey }> = [
  { key: 'all', labelKey: 'library.all' },
  { key: 'completed', labelKey: 'library.completed' },
  { key: 'in-progress', labelKey: 'library.in-progress' },
  { key: 'planned', labelKey: 'library.planned' },
  { key: 'on-hold', labelKey: 'library.on-hold' },
  { key: 'dropped', labelKey: 'library.dropped' },
];

function getVisiblePages(totalPages: number, currentPage: number): number[] {
  const pages: number[] = [];
  for (let page = 1; page <= totalPages; page += 1) {
    if (totalPages <= 7 || page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2) {
      pages.push(page);
    }
  }
  return pages;
}

interface LibraryCollectionProps {
  works: LibraryWork[];
  locale: string;
  timeZone: string;
}

export function LibraryCollection({ works, locale, timeZone }: LibraryCollectionProps) {
  const { t } = useTranslation(locale);
  const [activeTab, setActiveTab] = useState<WorkType | 'all'>('all');
  const [activeFilter, setActiveFilter] = useState<WorkStatus | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [reflectionsOnly, setReflectionsOnly] = useState(false);
  const [sort, setSort] = useState<LibrarySort>('experienced');
  const shouldReduceMotion = useMotionLevel() === 'reduced';

  const tabs = useMemo(
    () => [
      { key: 'all' as const, label: t('library.all'), count: works.length },
      ...WORK_TYPES.map((key) => ({
        key,
        label: t(`library.${key}`),
        count: works.filter((work) => work.type === key).length,
      })),
    ],
    [works, t],
  );
  const tabItems = useMemo(
    () => (activeTab === 'all' ? works : works.filter((work) => work.type === activeTab)),
    [works, activeTab],
  );

  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tabItems.length };
    for (const item of tabItems) {
      counts[item.status ?? 'unknown'] = (counts[item.status ?? 'unknown'] ?? 0) + 1;
    }
    return counts;
  }, [tabItems]);

  const filteredItems = useMemo(
    () =>
      sortLibraryWorks(
        tabItems.filter(
          (item) => (activeFilter === 'all' || item.status === activeFilter) && (!reflectionsOnly || hasReflection(item)),
        ),
        sort,
      ),
    [tabItems, activeFilter, reflectionsOnly, sort],
  );

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const pageItems = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const visiblePages = getVisiblePages(totalPages, currentPage);

  const shelfRef = useRef<HTMLDivElement>(null);
  /** Switching pages from the bottom pager brings the shelf's top back into view instead of leaving the reader mid-page. */
  function goToPage(page: number) {
    setCurrentPage(page);
    const shelf = shelfRef.current;
    if (shelf && shelf.getBoundingClientRect().top < 0) {
      shelf.scrollIntoView({ behavior: getScrollBehavior(), block: 'start' });
    }
  }

  function handleTabChange(key: WorkType | 'all') {
    setActiveTab(key);
    setActiveFilter('all');
    setCurrentPage(1);
  }

  function handleFilterChange(key: WorkStatus | 'all') {
    setActiveFilter(key);
    setCurrentPage(1);
  }

  return (
    <LazyMotionProvider>
      <div ref={shelfRef} className="bangumi-shelf space-y-5" data-library-shelf>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              data-library-reflections
              aria-pressed={reflectionsOnly}
              onClick={() => {
                setReflectionsOnly(!reflectionsOnly);
                setCurrentPage(1);
              }}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                reflectionsOnly
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {t('library.reflections')} <span className="tabular-nums">{tabItems.filter(hasReflection).length}</span>
            </button>
            <label className="flex items-center gap-2 text-muted-foreground text-xs">
              {t('library.sort')}
              <select
                data-library-sort
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as LibrarySort);
                  setCurrentPage(1);
                }}
                className="max-w-full rounded-md border border-border bg-background px-2 py-1.5 text-foreground text-xs"
              >
                {LIBRARY_SORTS.map((value) => (
                  <option key={value} value={value}>
                    {t(`library.sort.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="index-tabs bangumi-type-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                data-library-type={tab.key}
                aria-pressed={activeTab === tab.key}
                onClick={() => handleTabChange(tab.key)}
              >
                {tab.label}
                <sup>{tab.count}</sup>
              </button>
            ))}
          </div>
          <div className="index-tabs index-tabs-quiet">
            {FILTER_OPTIONS.map(
              ({ key, labelKey }) =>
                (key === 'all' || (filterCounts[key] ?? 0) > 0) && (
                  <button
                    key={key}
                    type="button"
                    data-library-status={key}
                    aria-pressed={activeFilter === key}
                    onClick={() => handleFilterChange(key)}
                  >
                    {t(labelKey)}
                    <sup>{filterCounts[key] ?? 0}</sup>
                  </button>
                ),
            )}
          </div>
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          <m.div
            key={`${activeTab}-${activeFilter}-${reflectionsOnly}-${sort}-${currentPage}`}
            className="bangumi-grid"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
          >
            {pageItems.map((item) => (
              <LibraryCard key={item.id} item={item} locale={locale} timeZone={timeZone} showStatus={activeFilter === 'all'} />
            ))}
          </m.div>
        </AnimatePresence>

        {filteredItems.length === 0 && (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-muted-foreground">{t('library.empty')}</p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              type="button"
              onClick={() => goToPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              aria-label={t('pagination.prev')}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <Icon icon="ri:arrow-left-s-line" className="size-4" />
            </button>
            <div className="flex gap-1">
              {visiblePages.map((page, index) => {
                const previousPage = visiblePages[index - 1];
                const showEllipsis = previousPage !== undefined && page - previousPage > 1;
                return (
                  <span key={page} className="flex items-center">
                    {showEllipsis && <span className="px-1 text-muted-foreground">…</span>}
                    <button
                      type="button"
                      onClick={() => goToPage(page)}
                      aria-current={currentPage === page ? 'page' : undefined}
                      className={cn(
                        'min-w-[2rem] rounded-md px-2 py-1.5 text-sm transition-colors',
                        currentPage === page
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80',
                      )}
                    >
                      {page}
                    </button>
                  </span>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              aria-label={t('pagination.next')}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <Icon icon="ri:arrow-right-s-line" className="size-4" />
            </button>
          </div>
        )}
      </div>
    </LazyMotionProvider>
  );
}
