import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import matter from 'gray-matter';
import YAML from 'yaml';
import { preparePersonalPosts } from '../scripts/prepare-personal-posts';
import { readMarkdownImport } from '../src/lib/posts/import';

async function fixture(t: { after: (cleanup: () => Promise<void>) => void }) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'personal-posts-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'legacy');
  const output = path.join(directory, 'prepared');
  await mkdir(source);
  return { directory, source, output };
}

const body = '\r\n# 原文\r\n\r\n```cpp\r\nint main() { return 0; }\r\n```\r\n';
async function article(source: string, folder: string, changes: Record<string, unknown> = {}) {
  const directory = path.join(source, folder);
  await mkdir(directory, { recursive: true });
  const text = `---\n${YAML.stringify({
    title: '我的文章',
    published: '2021-01-04',
    tags: ['codeforces'],
    category: '算法',
    draft: false,
    lang: 'zh_CN',
    description: '',
    ...changes,
  })}---\n${body}`;
  const file = path.join(directory, 'index.md');
  await writeFile(file, text);
  return { file, text };
}

test('prepares importable Markdown while preserving exact bodies, original metadata and local dates', async (t) => {
  const { source, output } = await fixture(t);
  const original = await article(source, 'codeforces-round-2021-01-04');
  await article(source, 'markdown-notes', { category: '技术', draft: true });
  const prepared = await preparePersonalPosts(source, output);
  assert.equal(prepared.length, 2);
  assert.equal(await readFile(original.file, 'utf8'), original.text);
  const imported = await readMarkdownImport(output, 'Asia/Shanghai');
  assert.equal(imported.length, 2);
  for (const item of imported) {
    assert.equal(item.data.markdown, body);
    assert.equal(item.data.publishedAt, '2021-01-03T16:00:00.000Z');
    assert.equal(item.data.frontmatter.published, undefined);
    assert.equal(item.data.frontmatter.category, undefined);
    assert.equal(item.data.frontmatter.sticky, undefined);
    assert.deepEqual(item.data.tags, ['codeforces']);
    const parsed = matter(await readFile(path.join(output, item.file), 'utf8'), {
      engines: { yaml: (header) => YAML.parse(header) },
    });
    assert.equal(parsed.data.date, '2021-01-04T00:00:00+08:00');
  }
  assert.deepEqual(imported.find((item) => item.data.link === 'markdown-notes')?.data.categories, ['技术']);
  assert.equal(imported.find((item) => item.data.link === 'markdown-notes')?.data._status, 'draft');
  assert.equal(imported.find((item) => item.data.link.startsWith('codeforces'))?.data._status, 'published');
  assert.equal((await stat(output)).mode & 0o777, 0o700);
});

test('refuses existing output directories and files without changing their content', async (t) => {
  const { directory, source, output } = await fixture(t);
  await article(source, 'my-post');
  await mkdir(output);
  const marker = path.join(output, 'existing.md');
  await writeFile(marker, 'keep');
  await assert.rejects(preparePersonalPosts(source, output), /already exists/);
  assert.equal(await readFile(marker, 'utf8'), 'keep');
  const existingFile = path.join(directory, 'existing-file');
  await writeFile(existingFile, 'keep file');
  await assert.rejects(preparePersonalPosts(source, existingFile), /already exists/);
  assert.equal(await readFile(existingFile, 'utf8'), 'keep file');
});

test('rejects duplicate folder slugs before writing any output', async (t) => {
  const { source, output } = await fixture(t);
  await article(source, 'one/same');
  await article(source, 'two/same');
  await assert.rejects(preparePersonalPosts(source, output), /Duplicate article folder/);
  await assert.rejects(stat(output), { code: 'ENOENT' });
});

test('rejects output inside the legacy source and source alias paths', async (t) => {
  const { directory, source } = await fixture(t);
  await article(source, 'my-post');
  await assert.rejects(preparePersonalPosts(source, path.join(source, 'new-content')), /separate/);
  const alias = path.join(directory, 'source-alias');
  await symlink(source, alias, 'dir');
  await assert.rejects(preparePersonalPosts(source, path.join(alias, 'new-content')), /separate/);
  assert.deepEqual(await readdir(source), ['my-post']);
});

test('rejects source symlinks, unsupported formats and invalid dates before writing', async (t) => {
  const { directory, source, output } = await fixture(t);
  const original = await article(source, 'my-post', { published: '2026-02-30' });
  await assert.rejects(preparePersonalPosts(source, output), /Invalid published date/);
  await assert.rejects(stat(output), { code: 'ENOENT' });
  await article(source, 'my-post', { published: '2026-02-20T12:00:00Z' });
  await assert.rejects(preparePersonalPosts(source, output), /date-only/);
  await article(source, 'my-post');
  await symlink(original.file, path.join(source, 'linked.md'));
  await assert.rejects(preparePersonalPosts(source, output), /Symlinks/);
  await rm(path.join(source, 'linked.md'));
  await writeFile(path.join(source, 'extra.mdx'), 'unsafe');
  await assert.rejects(preparePersonalPosts(source, output), /index.md/);
  assert.deepEqual(await readdir(directory), ['legacy']);
});
