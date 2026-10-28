import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createCoverPoolLoader, parseCoverPool, publicCoverURL } from './pool';

const fallback = Array.from({ length: 21 }, (_, index) => `/img/cover/${index + 1}.webp`);

test('legacy snapshots and empty managed pool retain the 21 default images; builtins stay at the site root', () => {
  assert.deepEqual(parseCoverPool(undefined, fallback), fallback);
  assert.deepEqual(parseCoverPool({ version: 1, covers: [] }, fallback), fallback);
  assert.deepEqual(
    parseCoverPool(
      { version: 1, covers: [fallback[0], 'https://cdn.example.test/upload.jpg', fallback[0]], extra: 'ignored' },
      fallback,
    ),
    [fallback[0], 'https://cdn.example.test/upload.jpg'],
  );
});

test('explicit invalid pool data fails clearly instead of silently dropping administrator selections', () => {
  for (const value of [
    null,
    {},
    { version: 2, covers: [] },
    { version: 1, covers: ['javascript:alert(1)'] },
    { version: 1, covers: ['https://user:secret@example.test/image.jpg'] },
  ]) {
    assert.throws(() => parseCoverPool(value, fallback), /Invalid|unsafe/);
  }
  for (const value of [
    'data:image/png;base64,bad',
    '//other.example/image.jpg',
    '/\\other/image.jpg',
    'file:///secret',
    undefined,
  ]) {
    assert.equal(publicCoverURL(value), undefined);
  }
});

test('a frozen snapshot is authoritative in production and never fetches a live API', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'article-cover-pool-'));
  const snapshot = path.join(directory, 'snapshot.json');
  try {
    await writeFile(snapshot, JSON.stringify({ coverPool: { version: 1, covers: ['https://cdn.example.test/upload.jpg'] } }));
    let requests = 0;
    const load = createCoverPoolLoader({
      fallback,
      snapshot,
      base: 'https://cms.example.test',
      payloadMode: true,
      development: false,
      fetcher: async () => {
        requests++;
        throw Error('unexpected API');
      },
    });
    assert.deepEqual(await load(), ['https://cdn.example.test/upload.jpg']);
    await writeFile(snapshot, '{}');
    assert.deepEqual(await load(), ['https://cdn.example.test/upload.jpg']);
    assert.equal(requests, 0);
    assert.deepEqual(await createCoverPoolLoader({ fallback, snapshot, payloadMode: true, development: false })(), fallback);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('files mode makes no pool request, while Payload development fetches and caches the public endpoint once', async () => {
  let requests = 0;
  const fetcher: typeof fetch = async (url, options) => {
    requests++;
    assert.equal(String(url), 'https://cms.example.test/api/site-covers');
    assert.equal(new Headers(options?.headers).has('Authorization'), false);
    assert.equal(options?.redirect, 'error');
    return Response.json({ version: 1, covers: [fallback[2]], ignored: [] });
  };
  assert.deepEqual(
    await createCoverPoolLoader({
      fallback,
      base: 'https://cms.example.test',
      payloadMode: false,
      development: true,
      fetcher,
    })(),
    fallback,
  );
  assert.equal(requests, 0);
  const load = createCoverPoolLoader({
    fallback,
    base: 'https://cms.example.test',
    payloadMode: true,
    development: true,
    fetcher,
  });
  assert.deepEqual(await Promise.all([load(), load()]), [[fallback[2]], [fallback[2]]]);
  assert.equal(requests, 1);
  await assert.rejects(
    createCoverPoolLoader({ fallback, base: 'https://cms.example.test', payloadMode: true, development: false })(),
    /CONTENT_BUILD_SNAPSHOT/,
  );
});

test('development failures and malformed responses remain visible and are not retried for every article', async () => {
  let requests = 0;
  const load = createCoverPoolLoader({
    fallback,
    base: 'https://cms.example.test',
    payloadMode: true,
    development: true,
    fetcher: async () => {
      requests++;
      return new Response('', { status: 503 });
    },
  });
  await assert.rejects(load(), /HTTP 503/);
  await assert.rejects(load(), /HTTP 503/);
  assert.equal(requests, 1);
});
