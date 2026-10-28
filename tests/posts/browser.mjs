// Real import/migration -> frozen Payload snapshot -> native Astro -> static browser.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const root = process.cwd();
const backend = path.join(root, 'services/payload');
const directory = await mkdtemp(path.join(tmpdir(), 'homepage-posts-browser-'));
const plan = path.join(directory, 'plan.json');
const snapshot = path.join(directory, 'snapshot.json');
const env = {
  ...process.env,
  NODE_ENV: 'production',
  DISABLE_PAYLOAD_HMR: 'true',
  NEXT_TELEMETRY_DISABLED: '1',
  PAYLOAD_SECRET: 'isolated-post-browser-secret-not-production',
  DATABASE_URL: `file:${directory}/payload.db`,
  MEDIA_DIR: `${directory}/media`,
  POSTS_FIXTURE_SNAPSHOT: snapshot,
};
const children = [];
let browser;
function start(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    ...options,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  child.output = () => output;
  return child;
}
function signalTree(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
async function run(command, args, options, expected = 0) {
  const child = start(command, args, options);
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  assert.equal(code, expected, child.output().slice(-6000));
  return child.output();
}
try {
  await run('pnpm', ['content:plan', 'src/content/blog', plan]);
  await run(process.execPath, ['node_modules/payload/bin.js', 'migrate'], { cwd: backend });
  await run(process.execPath, ['--import', 'tsx', 'scripts/import-markdown.ts', plan], { cwd: backend });
  await run(process.execPath, ['--import', 'tsx', 'scripts/import-markdown.ts', plan, '--apply'], { cwd: backend });
  const refused = await run(
    process.execPath,
    ['--import', 'tsx', 'scripts/import-markdown.ts', plan, '--apply'],
    { cwd: backend },
    1,
  );
  assert.ok(refused.includes('would be overwritten'));
  await run(process.execPath, ['--import', 'tsx', 'tests/helpers/posts-snapshot.ts'], { cwd: backend });
  // Extend only this disposable frozen input; no content or production API writes.
  const coverFixture = JSON.parse(await readFile(snapshot, 'utf8'));
  const fixtureWorkCover = 'https://covers.example.test/portrait.svg';
  const fixturePoolCovers = ['https://covers.example.test/pool-a.svg', 'https://covers.example.test/pool-b.svg'];
  const nativeReview = coverFixture.posts.find((post) => post.link === 'native-review');
  assert.ok(nativeReview);
  nativeReview.publishedAt = '2030-01-01T00:00:00Z';
  for (const work of coverFixture.works) {
    if (['fallback-work', 'own-reaction'].includes(work.slug)) work.coverUrl = fixtureWorkCover;
  }
  const nextFixtureID = Math.max(...coverFixture.posts.map((post) => post.id)) + 1;
  coverFixture.posts.push(
    {
      id: nextFixtureID,
      title: 'Manual cover review',
      link: 'manual-cover-review',
      locale: 'zh',
      markdown: 'Manual cover fixture.',
      publishedAt: '2030-01-02T00:00:00Z',
      _status: 'published',
      frontmatter: { cover: '/img/cover/2.webp' },
    },
    {
      id: nextFixtureID + 1,
      title: 'Pool cover review',
      link: 'pool-cover-review',
      locale: 'zh',
      markdown: 'Pool cover fixture.',
      publishedAt: '2030-01-03T00:00:00Z',
      _status: 'published',
    },
  );
  coverFixture.coverPool = { version: 1, covers: fixturePoolCovers };
  await writeFile(snapshot, JSON.stringify(coverFixture), { mode: 0o600 });
  await run('pnpm', ['build'], {
    env: {
      ...env,
      CONTENT_SOURCE: 'payload',
      CONTENT_BUILD_SNAPSHOT: snapshot,
      PAYLOAD_URL: 'http://127.0.0.1:3399',
      CONTENT_BUILD_TOKEN: 'test-build-only-credential-at-least-32-chars',
    },
  });
  const html = await readFile('dist/post/protected-review/index.html', 'utf8');
  assert.ok(!html.includes('PROTECTED BODY MUST NEVER BE PUBLISHED IN PLAINTEXT'));
  await assert.rejects(readFile('dist/post/protected-review.md'));
  await assert.rejects(readFile('dist/post/private-draft/index.html'));
  const preview = start('pnpm', ['preview', '--host', '127.0.0.1', '--port', '4333'], {
    env: {
      ...env,
      CONTENT_SOURCE: 'payload',
      PAYLOAD_URL: 'http://127.0.0.1:3399',
      CONTENT_BUILD_TOKEN: 'test-build-only-credential-at-least-32-chars',
    },
  });
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:4333', { signal: AbortSignal.timeout(2000) });
      await response.body?.cancel();
      if (response.ok) break;
    } catch {
      /* startup */
    }
    if (preview.exitCode !== null) throw new Error(preview.output());
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch();
  async function mockCoverImages(page) {
    await page.route('https://covers.example.test/**', (route) => {
      const portrait = route.request().url().endsWith('/portrait.svg');
      return route.fulfill({
        contentType: 'image/svg+xml',
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${portrait ? 180 : 640}" height="${portrait ? 300 : 320}"><rect width="100%" height="100%" fill="#36556c"/><circle cx="50%" cy="50%" r="60" fill="#f3bc83"/></svg>`,
      });
    });
  }
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 940 } });
    await mockCoverImages(page);
    const errors = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
    });
    await page.goto('http://127.0.0.1:4333/posts', { waitUntil: 'networkidle' });
    const workCard = page
      .locator('.post-item-card')
      .filter({ has: page.getByRole('heading', { name: 'Native Markdown review', exact: true }) });
    const manualCard = page
      .locator('.post-item-card')
      .filter({ has: page.getByRole('heading', { name: 'Manual cover review', exact: true }) });
    const poolCard = page
      .locator('.post-item-card')
      .filter({ has: page.getByRole('heading', { name: 'Pool cover review', exact: true }) });
    await expect(workCard).toHaveAttribute('data-cover-source', 'work');
    await expect(workCard.locator('.post-cover-image')).toHaveAttribute('src', fixtureWorkCover);
    await expect(workCard.locator('.post-cover-backdrop')).toHaveAttribute('src', fixtureWorkCover);
    await workCard.scrollIntoViewIfNeeded();
    const workLayout = await workCard.evaluate((card) => {
      const image = card.querySelector('.post-cover-image');
      const cover = card.querySelector('.post-item-cover');
      const backdrop = card.querySelector('.post-cover-backdrop');
      const box = cover.getBoundingClientRect();
      return {
        fit: getComputedStyle(image).objectFit,
        filter: getComputedStyle(backdrop).filter,
        clip: getComputedStyle(cover).clipPath,
        width: box.width,
        cardWidth: card.getBoundingClientRect().width,
        ratio: box.width / box.height,
      };
    });
    assert.equal(workLayout.fit, 'contain');
    assert.ok(workLayout.filter.includes('blur('));
    assert.equal(workLayout.clip, 'none');
    assert.ok(Math.abs(workLayout.width - workLayout.cardWidth) < 3);
    assert.ok(workLayout.ratio >= 1.98);
    await expect(manualCard).toHaveAttribute('data-cover-source', 'manual');
    await expect(manualCard.locator('.post-cover-backdrop')).toHaveCount(0);
    await expect(poolCard).toHaveAttribute('data-cover-source', 'pool');
    const assignedPoolCover = await poolCard.locator('.post-cover-image').getAttribute('src');
    assert.ok(fixturePoolCovers.includes(assignedPoolCover));
    await page.reload({ waitUntil: 'networkidle' });
    await expect(poolCard.locator('.post-cover-image')).toHaveAttribute('src', assignedPoolCover);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    const reviewLink = workCard.locator('a:has(h2)');
    await reviewLink.focus();
    await reviewLink.press('Enter');
    await expect(page.locator('.custom-content ins')).toHaveText('Highlighted');
    await expect(page.locator('.custom-content')).toContainText('Native note');
    await page.goto('http://127.0.0.1:4333/library');
    const fallback = page.locator('[data-work-slug="fallback-work"]');
    await expect(fallback.getByRole('link', { name: 'Native Markdown review', exact: true })).toBeVisible();
    await expect(fallback.getByRole('link')).toHaveCount(1);
    const own = page.locator('[data-work-slug="own-reaction"]');
    await expect(own.getByRole('link', { name: 'MY SHORT REACTION' })).toHaveAttribute('href', '/post/native-review');
    const draft = page.locator('[data-work-slug="draft-work"]');
    await expect(draft).toContainText('Draft article remains a gray note');
    await expect(draft.getByRole('link')).toHaveCount(0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await fallback.getByRole('link').click();
    await expect(page.locator('.custom-content ins')).toHaveText('Highlighted');
    await expect(page.locator('.custom-content')).toContainText('Native note');
    await page.goto('http://127.0.0.1:4333/post/markdown-notes');
    await expect(page.locator('.custom-content')).toContainText('文本格式');
    await expect(page.locator('.custom-content img[src*="Mikoto"]')).toHaveCount(1);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    await page.close();
  }
  const noScript = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 940 } });
  await mockCoverImages(noScript);
  const noScriptApiRequests = [];
  noScript.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) noScriptApiRequests.push(request.url());
  });
  await noScript.goto('http://127.0.0.1:4333/posts', { waitUntil: 'networkidle' });
  const noScriptWork = noScript
    .locator('.post-item-card')
    .filter({ has: noScript.getByRole('heading', { name: 'Native Markdown review', exact: true }) });
  await expect(noScriptWork.locator('.post-cover-image')).toBeVisible();
  await noScriptWork.locator('a:has(h2)').click();
  await expect(noScript.locator('.custom-content ins')).toHaveText('Highlighted');
  await expect(noScript.locator('.custom-content')).toContainText('Native note');
  assert.deepEqual(noScriptApiRequests, []);
  await noScript.close();
  await writeFile(snapshot, JSON.stringify({ works: [], posts: [] }));
  await run('pnpm', ['build'], {
    env: { ...env, CONTENT_SOURCE: 'payload', CONTENT_BUILD_SNAPSHOT: snapshot, PAYLOAD_URL: 'http://127.0.0.1:3399' },
  });
  await assert.rejects(readFile('dist/post/native-review/index.html'));
  assert.ok(!(await readFile('dist/library/index.html', 'utf8')).includes('data-work-slug='));
  console.log(
    'PASS: transactional Markdown import, overwrite refusal, native Markdown, protected/draft privacy, single article links, title fallback, original reactions, desktop/mobile and no visitor API calls',
  );
} finally {
  await browser?.close();
  for (const child of children) {
    signalTree(child, 'SIGTERM');
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const ended = new Promise((resolve) => child.once('close', resolve));
    const timeout = setTimeout(() => signalTree(child, 'SIGKILL'), 5000);
    await ended;
    clearTimeout(timeout);
  }
  await rm(directory, { recursive: true, force: true });
}
