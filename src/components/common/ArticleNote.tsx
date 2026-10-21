import type { ArticleLink } from '@lib/library/types';
import { useEffect, useId, useRef, useState } from 'react';

/** Shared by media and project cards; authored text takes precedence over an article title. */
export function ArticleNote({
  note,
  article,
  expansion,
}: {
  note?: string;
  article?: ArticleLink;
  /** Opt in with localized labels; the default compact rendering stays unchanged. */
  expansion?: { expand: string; collapse: string };
}) {
  const text = note?.trim() || article?.title;
  const expandable = Boolean(expansion);
  const contentId = useId();
  const contentRef = useRef<HTMLParagraphElement>(null);
  const [canExpand, setCanExpand] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const content = contentRef.current;
    if (!expandable || !text || !content) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const lineHeight = Number.parseFloat(getComputedStyle(content).lineHeight);
      if (!Number.isFinite(lineHeight) || !lineHeight) return;
      setCanExpand(content.scrollHeight > lineHeight * 3 + 1);
    };
    setExpanded(false);
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : undefined;
    observer?.observe(content);
    window.addEventListener('resize', measure);
    void document.fonts?.ready.then(measure);
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [expandable, text]);

  if (!text) return null;
  // Opted-in cards render complete text before hydration and with JavaScript off.
  const clamped = !expandable || (canExpand && !expanded);
  return (
    <>
      <p
        ref={contentRef}
        id={expandable ? contentId : undefined}
        data-article-note={expandable ? '' : undefined}
        className={
          clamped ? 'mt-2 line-clamp-3 break-words text-xs leading-relaxed' : 'mt-2 break-words text-xs leading-relaxed'
        }
      >
        {article ? (
          <a href={article.url} className="text-sky-700 underline-offset-4 hover:underline dark:text-sky-400">
            {text}
          </a>
        ) : (
          <span className="text-muted-foreground">{text}</span>
        )}
      </p>
      {canExpand && expansion && (
        <button
          type="button"
          data-note-expand
          aria-controls={contentId}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 min-h-8 rounded-sm text-left text-sky-700 text-xs underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-sky-700 focus-visible:outline-offset-2 dark:text-sky-400 dark:focus-visible:outline-sky-400"
        >
          {expanded ? expansion.collapse : expansion.expand}
        </button>
      )}
    </>
  );
}
