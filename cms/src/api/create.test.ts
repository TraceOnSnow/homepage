import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import matter from 'gray-matter';
import { Hono } from 'hono';
import { planContentMigration } from '../../../scripts/koharu/utils/migration-operations';
import { setCategoryMap } from '../lib/category';
import { CONTENT_DIR } from '../lib/paths';
import { createHandler } from './create';

test('new CMS articles preserve YAML values and pass the theme migration gate', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'koharu-cms-create-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  setCategoryMap({ 笔记: 'note' });
  t.after(() => setCategoryMap({}));
  const app = new Hono<{ Variables: { projectRoot: string } }>();
  app.use('*', async (c, next) => {
    c.set('projectRoot', root);
    await next();
  });
  app.post('/create', createHandler);
  for (const categories of [[], ['笔记']]) {
    const title = categories.length ? '写作: # 带标点的文章' : 'Simple Article';
    const response = await app.request('/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, categories, tags: ['a, b', '有: 空格'], draft: false }),
    });
    assert.equal(response.status, 201);
    const { postId } = await response.json();
    const { data } = matter(await fs.readFile(path.join(root, CONTENT_DIR, postId), 'utf8'));
    assert.equal(data.title, title);
    assert.deepEqual(data.tags, ['a, b', '有: 空格']);
    assert.equal(data.link, postId.replace(/\.md$/, ''));
    if (categories.length) assert.ok(data.link.startsWith('note/'));
  }
  const plan = planContentMigration({
    contentDir: path.join(root, CONTENT_DIR),
    siteConfigPath: path.join(root, 'no-site-config.yaml'),
  });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.changes, [], 'CMS output must build without manual migration');
  assert.equal(plan.scannedFiles, 2);
});
