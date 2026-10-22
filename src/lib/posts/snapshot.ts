import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';

export const postSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  link: z.string().min(1),
  locale: z.enum(['zh', 'en', 'ja', 'ko']),
  markdown: z.string().nullish(),
  publishedAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  description: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  categories: z.union([z.array(z.string()), z.array(z.array(z.string()))]).nullish(),
  frontmatter: z.record(z.unknown()).nullish(),
  cover: z.union([z.number(), z.object({ url: z.string().nullish() })]).nullish(),
  _status: z.literal('published'),
  deletedAt: z.null().optional(),
});
export type PublishedPost = z.infer<typeof postSchema>;

export function postFile(post: Pick<PublishedPost, 'link' | 'locale'>): string {
  if (
    post.link.length > 240 ||
    !post.link
      .split('/')
      .every((part) => part && part !== '.' && part !== '..' && !part.startsWith('_') && !/[\\?#%\s\p{Cc}]/u.test(part))
  ) {
    throw new Error('Unsafe article permalink.');
  }
  if (['zh', 'en', 'ja', 'ko'].includes(post.link.split('/')[0])) throw new Error('Permalinks must not begin with a locale.');
  return `${post.locale === 'zh' ? '' : `${post.locale}/`}${post.link}.md`;
}

export async function fetchPostSnapshot(base: string, token: string, fetcher: typeof fetch = fetch): Promise<PublishedPost[]> {
  const origin = new URL(base);
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || token.length < 32)
    throw new Error('Configure PAYLOAD_URL and a private CONTENT_BUILD_TOKEN (32+ characters).');
  const posts: PublishedPost[] = [];
  const ids = new Set<number>();
  for (let page = 1; page <= 1000; page++) {
    const url = new URL(`api/content/posts?page=${page}`, base.endsWith('/') ? base : `${base}/`);
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Article snapshot unavailable (HTTP ${response.status}).`);
    const data = await response.json();
    if (!Array.isArray(data.docs) || typeof data.hasNextPage !== 'boolean')
      throw new Error('Invalid article snapshot response.');
    for (const item of data.docs) {
      const post = postSchema.parse(item);
      postFile(post);
      if (ids.has(post.id)) throw new Error('Duplicate article ID in snapshot.');
      ids.add(post.id);
      posts.push(post);
    }
    if (!data.hasNextPage) return posts;
    if (!data.docs.length) throw new Error('Empty article page claims more results.');
  }
  throw new Error('Article pagination limit exceeded.');
}

export function serializePost(post: PublishedPost, publicOrigin: string, payloadIds = [post.id]): string {
  const options = { ...post.frontmatter };
  // Associations and publication metadata have one canonical owner.
  for (const key of ['works', 'title', 'link', 'date', 'draft', 'payloadId', 'tags', 'categories', 'description'])
    delete options[key];
  const cover = typeof post.cover === 'object' ? post.cover?.url : undefined;
  if (cover) {
    const url = new URL(cover, publicOrigin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error('Unsafe article cover URL.');
    options.cover = url.href;
  }
  const header = {
    ...options,
    title: post.title,
    link: post.link,
    date: post.publishedAt,
    payloadId: post.id,
    payloadIds,
    description: post.description ?? undefined,
    tags: post.tags ?? undefined,
    categories: post.categories ?? undefined,
    draft: false,
  };
  return `---\n${YAML.stringify(header)}---\n${post.markdown ?? ''}`;
}

/** Stage and validate everything before replacing the private, ignored build inputs. */
export async function syncPosts(options: {
  base: string;
  token: string;
  directory: string;
  publicOrigin: string;
  posts?: unknown[];
}): Promise<void> {
  const posts = options.posts
    ? options.posts.map((post) => postSchema.parse(post))
    : await fetchPostSnapshot(options.base, options.token);
  const parent = path.dirname(options.directory);
  await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  const stage = await fs.mkdtemp(path.join(parent, '.posts-'));
  const names = new Set<string>();
  const ids = new Set<number>();
  try {
    for (const post of posts) {
      const name = postFile(post);
      if (names.has(name) || ids.has(post.id)) throw new Error('Conflicting article permalink or ID.');
      ids.add(post.id);
      names.add(name);
      const file = path.join(stage, name);
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await fs.writeFile(
        file,
        serializePost(
          post,
          options.publicOrigin,
          posts.filter((other) => other.link === post.link).map((other) => other.id),
        ),
        { mode: 0o600 },
      );
    }
    const previous = `${options.directory}.previous`;
    await fs.rm(previous, { recursive: true, force: true });
    let existed = false;
    try {
      await fs.rename(options.directory, previous);
      existed = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    try {
      await fs.rename(stage, options.directory);
    } catch (error) {
      if (existed) await fs.rename(previous, options.directory);
      throw error;
    }
    await fs.rm(previous, { recursive: true, force: true });
  } finally {
    await fs.rm(stage, { recursive: true, force: true });
  }
}
