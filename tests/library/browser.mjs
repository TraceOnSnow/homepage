// Real isolated Payload -> Astro build -> static desktop/mobile browser regression.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

const root = process.cwd();
const backend = path.join(root, 'services/payload');
const directory = await mkdtemp(path.join(tmpdir(), 'homepage-library-'));
const payloadOrigin = 'http://127.0.0.1:3301';
const origin = 'http://127.0.0.1:4331';
const fixture = path.join(root, 'src/content/blog', `library-browser-${process.pid}.md`);
const draft = path.join(root, 'src/content/blog', `library-draft-${process.pid}.md`);
const children = [];
let browser;

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    ...options,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
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
async function run(command, args, options) {
  const child = start(command, args, options);
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', resolve);
  });
  assert.equal(code, 0, child.output().slice(-5000));
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(child.output().slice(-5000));
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      /* Wait for local startup. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server not ready: ${url}`);
}
async function stop(child) {
  signalTree(child, 'SIGTERM');
  if (child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise((resolve) => child.once('close', resolve));
  const timeout = setTimeout(() => signalTree(child, 'SIGKILL'), 5000);
  await ended;
  clearTimeout(timeout);
}

try {
  await mkdir(path.join(directory, 'media'));
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    DISABLE_PAYLOAD_HMR: 'true',
    DATABASE_URL: `file:${directory}/payload.db`,
    MEDIA_DIR: path.join(directory, 'media'),
    PAYLOAD_SECRET: 'temporary-library-fixture-secret',
    SERVER_URL: payloadOrigin,
  };
  await run(process.execPath, ['--import', 'tsx', 'tests/helpers/library-fixture.ts'], { cwd: backend, env });
  const api = start(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3301'],
    { cwd: backend, env },
  );
  await ready(`${payloadOrigin}/api/works`, api);
  await writeFile(
    fixture,
    '---\ntitle: Library integration article\nlink: library-integration-article\ndate: 2026-10-13\nworks: [library-test-game-0]\n---\n\nArticle linked to a public Work.\n',
  );
  await writeFile(
    draft,
    '---\ntitle: LIBRARY_DRAFT_SENTINEL\nlink: library-hidden-draft\ndate: 2026-10-13\ndraft: true\nworks: [library-test-game-0]\n---\n\nUnpublished.\n',
  );
  await run('pnpm', ['build'], {
    env: { ...process.env, NODE_ENV: 'production', ASTRO_TELEMETRY_DISABLED: '1', PAYLOAD_URL: payloadOrigin },
  });
  const html = await readFile(path.join(root, 'dist/library/index.html'), 'utf8');
  assert.ok(!html.includes('LIBRARY_PRIVATE_SENTINEL'));
  assert.ok(!html.includes('PRIVATE_NOTE_SENTINEL'));
  assert.ok(!html.includes('LIBRARY_DRAFT_SENTINEL'));
  assert.ok(!html.includes('temporary-library-fixture-secret'));
  const preview = start(
    process.execPath,
    ['node_modules/astro/bin/astro.mjs', 'preview', '--host', '127.0.0.1', '--port', '4331'],
    { env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } },
  );
  await ready(`${origin}/library`, preview);
  browser = await chromium.launch();
  let workRequests = 0;
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/works') workRequests++;
    });
    await page.goto(`${origin}/library`, { waitUntil: 'domcontentloaded' });
    const shelf = page.locator('[data-library-shelf]');
    await expect(shelf.locator('[data-work-slug]')).toHaveCount(24);
    await expect(shelf.locator('[data-library-type]')).toHaveCount(9);
    const unscored = shelf.locator('[data-work-slug="library-test-game-0"]');
    await expect(unscored.locator('.bangumi-own-score')).toHaveCount(0);
    await expect(unscored.locator('img')).toHaveAttribute(
      'src',
      /library-fixture.*200.*300|library-fixture.*640.*480|library-fixture/,
    );
    await expect(unscored.getByRole('link', { name: 'Public note for game 0' })).toHaveAttribute(
      'href',
      '/post/library-integration-article',
    );
    await expect(shelf.locator('[data-work-slug="library-test-game-1"] .bangumi-own-score')).toHaveText('★ 0');
    await shelf.locator('[data-library-type="game"]').click();
    await expect(shelf.locator('[data-work-slug]')).toHaveCount(24);
    await shelf.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(shelf.locator('[data-work-slug]')).toHaveCount(2);
    await shelf.locator('[data-library-status="completed"]').click();
    await expect(shelf.locator('[data-work-slug]')).toHaveCount(6);
    for (const type of ['book', 'movie', 'tv', 'anime', 'manga', 'comic', 'boardgame']) {
      await shelf.locator(`[data-library-type="${type}"]`).click();
      await expect(shelf.locator('[data-work-slug]')).toHaveCount(1);
      await expect(shelf.locator('[data-library-status="all"]')).toHaveAttribute('aria-pressed', 'true');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.goto(`${origin}/en/library`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1').filter({ hasText: 'Media Library' })).toBeVisible();
    await expect(page.locator('[data-library-type="game"]')).toContainText('Games');
    await expect(
      page.locator('[data-work-slug="library-test-game-0"]').getByRole('link', { name: 'Public note for game 0' }),
    ).toHaveAttribute('href', '/en/post/library-integration-article');
    await page.locator('[data-work-slug="library-test-game-0"]').getByRole('link', { name: 'Public note for game 0' }).click();
    await expect(page.getByRole('article').getByText('Article linked to a public Work.', { exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `PASS ${viewport.width}px: eight types, status, paging, personal scores, upload cover, Markdown links, locale and overflow.`,
    );
  }
  await stop(api);
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${origin}/library`);
  await expect(page.locator('[data-work-slug="library-test-game-0"]')).toBeVisible();
  await expect(page.locator('[data-work-slug="library-test-game-0"]')).toContainText('Public note for game 0');
  assert.equal(workRequests, 0, 'visitors must not fetch the Payload Works API');
  await context.close();
  console.log(
    'PASS Payload stopped: built card text and article links remain readable without JavaScript or Works API calls. Uploaded images still require their media host.',
  );
} finally {
  await browser?.close();
  for (const child of children.reverse()) await stop(child);
  await rm(fixture, { force: true });
  await rm(draft, { force: true });
  await rm(directory, { recursive: true, force: true });
}
