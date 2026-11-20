import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { coverFile, localCoverUrl, prepareCoverCache, sharpTransform } from './cover-cache';
import { externalCoverUrls } from './cover-integration';

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#3a7' } })
    .png()
    .toBuffer();

function imageFetcher(responses: Record<string, () => Response>, calls: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const respond = responses[url];
    if (!respond) throw new Error('network down');
    return respond();
  }) as typeof fetch;
}

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'cover-cache-'));
}

test('downloads once, converts to a bounded webp and reuses the cache on the next build', async () => {
  const directory = await tempDir();
  const url = 'https://img.example.test/a.jpg';
  const body = await png(1200, 1800);
  const calls: string[] = [];
  const fetcher = imageFetcher(
    { [url]: () => new Response(new Uint8Array(body), { headers: { 'content-type': 'image/png' } }) },
    calls,
  );
  const first = await prepareCoverCache({ urls: [url, url], directory, fetcher });
  assert.deepEqual(first.manifest, { [url]: coverFile(url) });
  assert.equal(first.fetched, 1);
  const meta = await sharp(path.join(directory, coverFile(url))).metadata();
  assert.equal(meta.format, 'webp');
  assert.ok(meta.width && meta.width <= 400 && meta.height && meta.height <= 600);

  const second = await prepareCoverCache({ urls: [url], directory, fetcher });
  assert.equal(second.fetched, 0);
  assert.deepEqual(second.manifest, first.manifest);
  assert.equal(calls.length, 1);
});

test('failures keep the original URL and are not retried within a day', async () => {
  const directory = await tempDir();
  const html = 'https://img.example.test/page';
  const down = 'https://img.example.test/down.jpg';
  const missing = 'https://img.example.test/404.jpg';
  const calls: string[] = [];
  const fetcher = imageFetcher(
    {
      [html]: () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
      [missing]: () => new Response('', { status: 404 }),
    },
    calls,
  );
  let clock = 1_000_000;
  const now = () => clock;
  const result = await prepareCoverCache({ urls: [html, down, missing], directory, fetcher, now });
  assert.deepEqual(result.manifest, {});
  assert.equal(result.failed, 3);
  assert.equal(localCoverUrl(html, result.manifest), html);

  const again = await prepareCoverCache({ urls: [html, down, missing], directory, fetcher, now: () => Date.now() });
  assert.equal(again.failed, 0);
  assert.equal(calls.length, 3);
  clock = Date.now() + 25 * 60 * 60 * 1000;
  const later = await prepareCoverCache({ urls: [missing], directory, fetcher, now });
  assert.equal(later.failed, 1);
});

test('stops starting downloads after the time budget', async () => {
  const directory = await tempDir();
  const body = await png(20, 30);
  const urls = ['https://img.example.test/1.png', 'https://img.example.test/2.png', 'https://img.example.test/3.png'];
  const fetcher = imageFetcher(
    Object.fromEntries(
      urls.map((url) => [url, () => new Response(new Uint8Array(body), { headers: { 'content-type': 'image/png' } })]),
    ),
  );
  let clock = 0;
  const result = await prepareCoverCache({
    urls,
    directory,
    fetcher,
    concurrency: 1,
    budgetMs: 10,
    now: () => clock,
    transform: async (input) => {
      clock += 20;
      return sharpTransform(input);
    },
  });
  assert.equal(result.fetched, 1);
  assert.equal(result.deferred, 2);
  assert.equal(Object.keys(result.manifest).length, 1);
});

test('only public external covers are cached; uploads on the site origin stay as they are', () => {
  const work = { id: 1, slug: 'a', title: 'A', type: 'game', visibility: 'public', _status: 'published' };
  const urls = externalCoverUrls(
    [
      { ...work, coverUrl: 'https://img.example.test/a.jpg' },
      { ...work, id: 2, slug: 'b', coverUrl: 'https://img.example.test/a.jpg' },
      { ...work, id: 3, slug: 'c', visibility: 'private', coverUrl: 'https://img.example.test/private.jpg' },
      { ...work, id: 4, slug: 'd', cover: { url: '/api/media/file/d.webp' } },
      { ...work, id: 5, slug: 'e', coverUrl: 'https://site.example.test/img/e.png' },
    ],
    'http://127.0.0.1:3000',
    'https://site.example.test',
  );
  assert.deepEqual(urls, ['https://img.example.test/a.jpg']);
  assert.equal(localCoverUrl(urls[0], { [urls[0]]: 'x.webp' }), '/library-covers/x.webp');
  assert.equal(localCoverUrl(undefined, { [urls[0]]: 'x.webp' }), undefined);
});

test('conversion still works after the Vite runner that loaded the module is closed (as in astro build)', async () => {
  const { runnerImport } = await import('vite');
  const { module } = await runnerImport<typeof import('./cover-cache')>(new URL('./cover-cache.ts', import.meta.url).pathname);
  const out = await module.sharpTransform(await png(30, 45));
  assert.equal((await sharp(out).metadata()).format, 'webp');
});
