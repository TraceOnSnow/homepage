// Synthetic public snapshot -> real Astro build -> keyboard/mobile browser checks.
// All caches and output stay in the worktree, even when node_modules is shared read-only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';

const root = process.cwd();
await mkdir('.cache/library-usability', { recursive: true });
const directory = await mkdtemp(path.join(root, '.cache/library-usability/run-'));
const snapshot = path.join(directory, 'snapshot.json');
const origin = 'http://127.0.0.1:4332';
const longNote = `${'这是一段需要完整阅读的感想。'.repeat(45)}最后一句也应该能够读到。`;
const works = Array.from({ length: 56 }, (_, index) => ({
  id: index + 1,
  slug: `ux-work-${index}`,
  title: `验收作品 ${String(index).padStart(2, '0')}`,
  type: index < 52 ? 'game' : 'book',
  status: index % 2 ? 'planned' : 'completed',
  visibility: 'public',
  _status: 'published',
  rating: index % 11,
  createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  note: index === 0 || index === 55 ? longNote : index === 1 ? 'SPECIAL reaction for searching' : '',
}));
await writeFile(snapshot, JSON.stringify({ works }));
const env = {
  ...process.env,
  CONTENT_SOURCE: 'files',
  CONTENT_BUILD_SNAPSHOT: snapshot,
  PAYLOAD_URL: 'http://127.0.0.1:9',
  NODE_OPTIONS: '--max-old-space-size=1024',
  ASTRO_TELEMETRY_DISABLED: '1',
  NODE_ENV: 'production',
};
let child, browser;
try {
  // Programmatic overrides avoid writing Astro/Vite caches through a production dependency symlink.
  const build = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {build} from 'astro'; await build({cacheDir:${JSON.stringify(path.join(directory, 'astro-cache'))},outDir:${JSON.stringify(path.join(directory, 'dist'))},vite:{cacheDir:${JSON.stringify(path.join(directory, 'vite-cache'))}}});`,
    ],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let buildOutput = '';
  build.stdout.on('data', (chunk) => {
    buildOutput = (buildOutput + chunk).slice(-14000);
  });
  build.stderr.on('data', (chunk) => {
    buildOutput = (buildOutput + chunk).slice(-14000);
  });
  const code = await new Promise((resolve, reject) => {
    build.once('error', reject);
    build.once('exit', resolve);
  });
  assert.equal(code, 0, buildOutput);
  await writeFile(path.join(directory, 'build.log'), buildOutput);
  child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {preview} from 'astro'; await preview({outDir:${JSON.stringify(path.join(directory, 'dist'))},cacheDir:${JSON.stringify(path.join(directory, 'astro-cache'))},vite:{cacheDir:${JSON.stringify(path.join(directory, 'vite-cache'))}},server:{host:'127.0.0.1',port:4332}});`,
    ],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw Error(output);
    try {
      const response = await fetch(`${origin}/library/`);
      await response.body?.cancel();
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Starting. */
    }
    await sleep(250);
  }
  assert.ok(ready, output);
  browser = await chromium.launch({ headless: true });
  const errors = [],
    apiRequests = [];
  for (const width of [1365, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
    });
    await page.goto(`${origin}/library/?type=game&page=2&utm_source=test#shelf`);
    const shelf = page.locator('[data-library-shelf]');
    const cards = shelf.locator('[data-work-slug]');
    await expect(shelf.locator('[data-library-type=game]')).toHaveAttribute('aria-pressed', 'true');
    await expect(shelf.getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(cards).toHaveCount(24);
    assert.equal(
      await page.locator('#site-header .logo-text:visible').evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length;
      }),
      1,
      'The site name should stay on one line',
    );
    const slugs = await cards.evaluateAll((elements) => elements.map((element) => element.dataset.workSlug));
    await page.reload();
    await expect
      .poll(() => cards.evaluateAll((elements) => elements.map((element) => element.dataset.workSlug)))
      .toEqual(slugs);
    await page.goto(`${origin}/about/`);
    await page.goBack();
    await expect(shelf.locator('[data-library-type=game]')).toHaveAttribute('aria-pressed', 'true');
    await expect(shelf.getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page');
    const historyLength = await page.evaluate(() => history.length);
    await shelf.locator('[data-library-search]').fill('special');
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText('验收作品 01');
    await expect(page).toHaveURL(/utm_source=test/);
    assert.equal(new URL(page.url()).hash, '#shelf');
    await expect(shelf.locator('[data-library-results]')).toContainText('1');
    await shelf.locator('[data-library-search]').fill('no such work');
    await expect(cards).toHaveCount(0);
    await expect(shelf).toContainText('没有找到符合条件');
    await shelf.locator('[data-library-reset]').click();
    await expect(cards).toHaveCount(24);
    assert.equal(await page.evaluate(() => history.length), historyLength, 'Filtering must not fill browser history');
    await shelf.locator('[data-library-search]').fill('验收作品 00');
    await expect(cards).toHaveCount(1);
    await expect(shelf.locator('[data-library-search]')).toHaveValue('验收作品 00');
    const expand = shelf.getByRole('button', { name: '展开感想', exact: true });
    await expect(expand).toBeVisible();
    await expand.focus();
    await page.keyboard.press('Enter');
    await expect(shelf.getByRole('button', { name: '收起感想', exact: true })).toHaveAttribute('aria-expanded', 'true');
    const note = shelf.locator('[data-work-slug="ux-work-0"]');
    await expect(note).toContainText('最后一句也应该能够读到。');
    const noteBounds = await note.boundingBox();
    const shelfBounds = await shelf.boundingBox();
    assert.ok(noteBounds.width >= shelfBounds.width * 0.9, 'Expanded reactions need the full shelf width');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px overflow`);
    await page.screenshot({ path: path.join(directory, `library-${width}.png`), fullPage: true });
    await page.goto(`${origin}/library/?page=999999&sort=rating`);
    await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe('3');
    await expect(cards).toHaveCount(8);
    await page.goto(`${origin}/en/library/?q=SPECIAL`);
    await expect(page.getByRole('searchbox', { name: 'Search works' })).toHaveValue('SPECIAL');
    await expect(page.locator('[data-work-slug]')).toHaveCount(1);
    await context.close();
  }
  const noJS = await browser.newContext({ javaScriptEnabled: false });
  const noJSPage = await noJS.newPage();
  await noJSPage.goto(`${origin}/library/`);
  // SSR must keep complete text even when collapsed controls need JavaScript.
  const html = await readFile(path.join(directory, 'dist/library/index.html'), 'utf8');
  assert.ok(html.includes('最后一句也应该能够读到。'));
  await expect(noJSPage.locator('[data-work-slug]')).toHaveCount(24);
  await noJS.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(apiRequests, []);
  const report = {
    status: 'passed',
    directory,
    viewports: [1365, 390, 320],
    browserErrors: errors.length,
    checks: [
      'search-public-text',
      'empty-and-reset',
      'reload-return-state-no-history-spam',
      'page-clamping',
      'keyboard-expand-note',
      'English',
      'SSR',
      'no-visitor-API',
    ],
  };
  await writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  if (child && child.exitCode === null) {
    const done = new Promise((resolve) => child.once('close', resolve));
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    await done;
    clearTimeout(timer);
  }
}
