import { ArticleNote } from '@components/common/ArticleNote';
import { useTranslation } from '@hooks/useTranslation';
import { type LibraryWork, showsStatus, statusLabelKey } from '@lib/library/types';
import { formatLibraryDate } from '@lib/library/view';

export function LibraryCard({ item, locale, timeZone }: { item: LibraryWork; locale: string; timeZone: string }) {
  const { t } = useTranslation(locale);
  // Only personal experience dates are shown; the date a work was added to the site is not.
  const date = item.experiencedAt;
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
        {item.status && showsStatus(item.type) && (
          <span className="bangumi-ribbon" data-status={item.status}>
            {t(statusLabelKey(item.status, item.type))}
          </span>
        )}
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
        {item.rating !== undefined && <span className="bangumi-own-score tabular-nums">★ {item.rating}/100</span>}
      </p>
      {date && (
        <p className="mt-1 text-muted-foreground text-xs">
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
