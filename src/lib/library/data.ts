import { z } from 'zod';
import { type ArticleLink, type LibraryWork, WORK_STATUSES, WORK_TYPES } from './types';

const workSchema = z.object({
  id: z.union([z.number(), z.string()]),
  slug: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(WORK_TYPES),
  visibility: z.literal('public'),
  status: z.enum(WORK_STATUSES).nullish(),
  rating: z.number().min(0).max(10).nullish(),
  releaseDate: z.string().nullish(),
  createdAt: z.string().nullish(),
  experiences: z.array(z.object({ startedOn: z.string().nullish(), endedOn: z.string().nullish() })).nullish(),
  note: z.string().nullish(),
  article: z.union([z.number(), z.string(), z.object({ id: z.union([z.number(), z.string()]) })]).nullish(),
  coverUrl: z.string().nullish(),
  cover: z
    .union([
      z.number(),
      z.string(),
      z.object({
        url: z.string().nullish(),
        sizes: z.object({ card: z.object({ url: z.string().nullish() }).nullish() }).nullish(),
      }),
    ])
    .nullish(),
  sources: z.array(z.object({ url: z.string().nullish() })).nullish(),
});

export function safePublicURL(value: string | null | undefined, base?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function publicLibraryWork(input: unknown, base: string): LibraryWork | undefined {
  // Defense in depth: even an accidentally authenticated response cannot publish private Works.
  if (!input || typeof input !== 'object' || !('visibility' in input) || input.visibility !== 'public') return undefined;
  const result = workSchema.safeParse(input);
  if (!result.success) throw new Error('Library received an invalid public Work. Check the Payload schema.');
  const work = result.data;
  const media = typeof work.cover === 'object' ? work.cover : undefined;
  return {
    id: work.id,
    slug: work.slug,
    title: work.title,
    type: work.type,
    status: work.status ?? undefined,
    rating: work.rating ?? undefined,
    year: work.releaseDate?.match(/^\d{4}/)?.[0],
    recordedAt: validDate(work.createdAt),
    experiencedAt: work.experiences
      ?.map((experience) => validExperienceDate(experience.endedOn))
      .filter((date): date is string => Boolean(date))
      .sort((a, b) => Date.parse(a) - Date.parse(b))
      .at(-1),
    coverUrl:
      safePublicURL(media?.sizes?.card?.url, base) ?? safePublicURL(media?.url, base) ?? safePublicURL(work.coverUrl, base),
    sourceUrl: work.sources?.map((source) => safePublicURL(source.url)).find(Boolean),
    note: work.note || undefined,
    articles: [],
    articleId: typeof work.article === 'object' ? work.article?.id : (work.article ?? undefined),
  };
}

function validDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function validExperienceDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (/^[1-9]\d{3}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().startsWith(value) ? value : undefined;
  }
  return validDate(value);
}

export async function fetchLibraryWorks(base: string, fetcher: typeof fetch = fetch): Promise<LibraryWork[]> {
  if (!safePublicURL(base)) throw new Error('PAYLOAD_URL must be an HTTP(S) URL without credentials.');
  const works: LibraryWork[] = [];
  const ids = new Set<number | string>();
  let page = 1;
  while (page <= 1000) {
    const url = new URL('api/works', base.endsWith('/') ? base : `${base}/`);
    url.search = new URLSearchParams({
      depth: '1',
      limit: '100',
      page: String(page),
      sort: 'slug',
      'where[visibility][equals]': 'public',
    }).toString();
    const response = await fetcher(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Library could not read Payload (HTTP ${response.status}).`);
    const result = await response.json();
    if (!Array.isArray(result.docs) || typeof result.hasNextPage !== 'boolean')
      throw new Error('Library received an invalid Payload page.');
    for (const doc of result.docs) {
      const work = publicLibraryWork(doc, base);
      if (work && !ids.has(work.id)) {
        ids.add(work.id);
        works.push(work);
      }
    }
    if (!result.hasNextPage) return works;
    if (result.docs.length === 0) throw new Error('Library received an empty page with more pages indicated.');
    page += 1;
  }
  throw new Error('Library exceeded the Payload pagination limit.');
}

export function attachArticles(
  works: LibraryWork[],
  posts: Array<ArticleLink & { works?: string[]; draft?: boolean; payloadId?: number; payloadIds?: number[] }>,
  payloadMode = false,
): LibraryWork[] {
  const index = new Map<string, ArticleLink[]>();
  for (const post of posts) {
    if (post.draft) continue;
    for (const slug of new Set(post.works ?? [])) {
      const articles = index.get(slug) ?? [];
      if (!articles.some((article) => article.url === post.url)) articles.push({ title: post.title, url: post.url });
      index.set(slug, articles);
    }
  }
  return works.map((work) => {
    const article = posts.find(
      (post) =>
        !post.draft &&
        [post.payloadId, ...(post.payloadIds ?? [])].some((id) => id !== undefined && String(id) === String(work.articleId)),
    );
    return {
      ...work,
      articles: article ? [{ title: article.title, url: article.url }] : payloadMode ? [] : (index.get(work.slug) ?? []),
    };
  });
}
