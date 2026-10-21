import { ArticleNote } from '@components/common/ArticleNote';
import { useTranslation } from '@hooks/useTranslation';
import type { LibraryWork } from '@lib/library/types';
import { displayDate, formatLibraryDate } from '@lib/library/view';

export function LibraryCard({
  item,
  locale,
  showStatus,
  timeZone,
}: {
  item: LibraryWork;
  locale: string;
  showStatus: boolean;
  timeZone: string;
}) {
  const { t } = useTranslation(locale);
  const date = displayDate(item);
  const mainArticle = item.articles[0];
  const coverAndTitle = (
    <>
      <div className="bangumi-poster">
        {item.coverUrl ? (
          <img
            src={item.coverUrl}
            alt=""
            width={200}
            height={300}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground text-xs">
            {t('bangumi.noImage')}
          </span>
        )}
        {item.status === 'in-progress' && showStatus && <span className="bangumi-ribbon">{t('library.in-progress')}</span>}
      </div>
      <h2 className="bangumi-title" title={item.title}>
        {item.title}
      </h2>
    </>
  );
  return (
    <article data-work-slug={item.slug} className="min-w-0">
      {item.sourceUrl ? (
        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="bangumi-card group">
          {coverAndTitle}
        </a>
      ) : (
        <div className="bangumi-card group">{coverAndTitle}</div>
      )}
      <p className="bangumi-meta">
        {showStatus && item.status && item.status !== 'in-progress' && <span>{t(`library.${item.status}`)}</span>}
        {item.rating !== undefined && <span className="bangumi-own-score tabular-nums">★ {item.rating}</span>}
      </p>
      {date && (
        <p className="mt-1 text-muted-foreground text-xs">
          {t(item.experiencedAt ? 'library.experiencedAt' : 'library.recordedAt')}{' '}
          <time dateTime={date}>{formatLibraryDate(date, locale, timeZone)}</time>
        </p>
      )}
      <ArticleNote
        note={item.note}
        article={mainArticle}
        expansion={{ expand: t('library.expandNote'), collapse: t('library.collapseNote') }}
      />
    </article>
  );
}
