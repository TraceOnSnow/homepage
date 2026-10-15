import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import matter from 'gray-matter';
import { readMarkdownImport } from './import';
import { fetchPostSnapshot, type PublishedPost, postFile, serializePost, syncPosts } from './snapshot';

const post: PublishedPost = {
  id: 1,
  title: '文章',
  link: 'note/review',
  locale: 'zh',
  markdown: '\r\n纯文字\r\n++强调++\r\n',
  publishedAt: '2020-01-02T00:00:00Z',
  _status: 'published',
  frontmatter: { sticky: true, works: ['stale'], title: 'stale', math: false },
};
test('source keeps its exact Markdown body, native flags and permalink without stale relations', () => {
  const result = matter(serializePost(post, 'https://traceonsnow.com'));
  assert.equal(result.content, post.markdown);
  assert.equal(result.data.title, '文章');
  assert.equal(result.data.math, false);
  assert.equal(result.data.works, undefined);
  assert.equal(postFile({ ...post, locale: 'en' }), 'en/note/review.md');
  assert.throws(() => postFile({ ...post, link: '../outside' }));
});
test('snapshot validates status, pagination and auth; API failure cannot replace previous inputs', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'posts-snapshot-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = {
    base: 'http://localhost:3000',
    token: 'private-test-token-32-characters-long',
    directory: path.join(directory, 'content'),
    publicOrigin: 'https://traceonsnow.com',
  };
  await syncPosts({ ...options, posts: [post] });
  const before = await readFile(path.join(options.directory, 'note/review.md'), 'utf8');
  await assert.rejects(syncPosts({ ...options, posts: [{ ...post, _status: 'draft' }] }));
  assert.equal(await readFile(path.join(options.directory, 'note/review.md'), 'utf8'), before);
  const pages = await fetchPostSnapshot(options.base, options.token, async (_url, init) => {
    assert.equal((init?.headers as { Authorization: string }).Authorization, `Bearer ${options.token}`);
    return Response.json({ docs: [post], hasNextPage: false });
  });
  assert.equal(pages.length, 1);
  await assert.rejects(fetchPostSnapshot(options.base, options.token, async () => Response.json({}, { status: 503 })));
  await syncPosts({ ...options, posts: [] });
  await assert.rejects(readFile(path.join(options.directory, 'note/review.md')));
});
test('existing Markdown import preserves bodies and site-local dates across all bundled languages', async () => {
  const plan = await readMarkdownImport('src/content/blog', 'Asia/Shanghai');
  assert.equal(plan.length, 38);
  const imported = plan.find((item) => item.data.link === 'markdown-notes');
  assert.ok(imported);
  assert.equal(imported.data.publishedAt, '2026-02-19T16:00:00.000Z');
  assert.equal(imported.data.markdown, matter(await readFile(`src/content/blog/${imported.file}`, 'utf8')).content);
  assert.ok(plan.some((item) => item.data.locale === 'en'));
});
