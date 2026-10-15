import { useTranslation } from '@hooks/useTranslation';
import type { LibraryWork } from '@lib/library/types';

export function LibraryCard({ item, locale, showStatus }: { item: LibraryWork; locale: string; showStatus: boolean }) {
  const { t } = useTranslation(locale);
  const coverAndTitle = (
    <>
      <div className="bangumi-poster">
        {item.coverUrl ? (
          <img src={item.coverUrl} alt="" width={200} height={300} loading="lazy" decoding="async" />
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
        {item.year && <span>{item.year}</span>}
        {item.rating !== undefined && <span className="bangumi-own-score tabular-nums">★ {item.rating}</span>}
      </p>
      {item.note && <p className="mt-2 line-clamp-3 break-words text-muted-foreground text-xs leading-relaxed">{item.note}</p>}
      {item.articles.length > 0 && (
        <div className="mt-2 space-y-1 text-xs">
          <p className="text-muted-foreground">{t('library.articles')}</p>
          {item.articles.map((article) => (
            <a key={article.url} href={article.url} className="block break-words text-primary hover:underline">
              {article.title}
            </a>
          ))}
        </div>
      )}
    </article>
  );
}
