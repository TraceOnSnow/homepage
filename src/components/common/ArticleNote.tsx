import type { ArticleLink } from '@lib/library/types';

/** Shared by media and project cards; authored text takes precedence over an article title. */
export function ArticleNote({ note, article }: { note?: string; article?: ArticleLink }) {
  const text = note?.trim() || article?.title;
  if (!text) return null;
  return (
    <p className="mt-2 line-clamp-3 break-words text-xs leading-relaxed">
      {article ? (
        <a href={article.url} className="text-sky-700 underline-offset-4 hover:underline dark:text-sky-400">
          {text}
        </a>
      ) : (
        <span className="text-muted-foreground">{text}</span>
      )}
    </p>
  );
}
