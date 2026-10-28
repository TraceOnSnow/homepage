import type { LibraryWork } from '../library/types';

export interface ArticleCoverInput {
  slug: string;
  link?: string;
  cover?: string;
  payloadId?: number;
  payloadIds?: number[];
  works?: string[];
}

export interface ArticleCover {
  src: string;
  source: 'manual' | 'work' | 'pool';
}

/** Only stable, explicit article identities participate; titles and list positions never do. */
export function articleCoverIdentity(post: ArticleCoverInput): string {
  const ids = [...new Set([post.payloadId, ...(post.payloadIds ?? [])].filter((id) => id !== undefined))].sort((a, b) => a - b);
  return ids.length ? `payload:${ids[0]}` : `post:${post.link || post.slug}`;
}

export function stableCoverIndex(identity: string, length: number): number {
  let hash = 2166136261;
  for (const character of identity) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return length ? (hash >>> 0) % length : 0;
}

/** Works must already have passed publicLibraryWork; never fetch privileged records for artwork. */
export function resolveArticleCover(
  post: ArticleCoverInput,
  works: LibraryWork[],
  pool: string[],
  payloadMode: boolean,
): ArticleCover {
  if (post.cover) return { src: post.cover, source: 'manual' };
  const ids = new Set([post.payloadId, ...(post.payloadIds ?? [])].filter((id) => id !== undefined).map(String));
  const associated = works.filter(
    (work) =>
      work.coverUrl &&
      ((work.articleId !== undefined && ids.has(String(work.articleId))) || (!payloadMode && post.works?.includes(work.slug))),
  );
  // Prefer canonical Posts relationships over the legacy files-mode slug mapping.
  associated.sort((a, b) => {
    const aCanonical = a.articleId !== undefined && ids.has(String(a.articleId));
    const bCanonical = b.articleId !== undefined && ids.has(String(b.articleId));
    return (
      Number(bCanonical) - Number(aCanonical) ||
      a.slug.localeCompare(b.slug, 'en') ||
      String(a.id).localeCompare(String(b.id), 'en')
    );
  });
  if (associated[0]?.coverUrl) return { src: associated[0].coverUrl, source: 'work' };
  if (!pool.length) throw new Error('Article cover pool must contain at least one image.');
  return { src: pool[stableCoverIndex(articleCoverIdentity(post), pool.length)], source: 'pool' };
}
