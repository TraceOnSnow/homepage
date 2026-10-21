import assert from 'node:assert/strict';
import test from 'node:test';
import { attachArticles, fetchLibraryWorks, publicLibraryWork, safePublicURL } from './data';
import { WORK_STATUSES, WORK_TYPES } from './types';

const base = 'https://cms.example.test';
function requireWork(input: unknown, origin = base) {
  const result = publicLibraryWork(input, origin);
  assert.ok(result);
  return result;
}

const work = { id: 1, slug: 'a-game', title: 'A game', type: 'game', visibility: 'public', _status: 'published' };

test('Payload uses one selected article with language fallback and never revives stale Markdown associations', () => {
  const displayed = requireWork({ ...work, article: { id: 7, markdown: 'must-not-ship', title: 'backend title' } });
  const localized = { payloadId: 8, payloadIds: [7, 8], title: 'Translated title', url: '/en/post/review' };
  assert.deepEqual(attachArticles([displayed], [localized], true)[0].articles, [
    { title: 'Translated title', url: '/en/post/review' },
  ]);
  const legacy = { title: 'Legacy', url: '/post/old', works: ['a-game'] };
  assert.deepEqual(attachArticles([displayed], [legacy], true)[0].articles, []);
  assert.deepEqual(attachArticles([displayed], [{ ...localized, draft: true }], true)[0].articles, []);
  assert.ok(!JSON.stringify(displayed).includes('must-not-ship'));
});

test('Library exports only public display fields and personal ratings, preserving a zero rating', () => {
  assert.equal(publicLibraryWork({ ...work, visibility: 'private', note: 'private note' }, base), undefined);
  assert.equal(publicLibraryWork({ ...work, _status: 'draft', note: 'unpublished draft' }, base), undefined);
  assert.equal(publicLibraryWork({ ...work, _status: undefined }, base), undefined);
  const displayed = requireWork(
    {
      ...work,
      rating: 0,
      communityScore: 9,
      credentials: 'must-not-ship',
      sources: [{ provider: 'igdb', externalId: '1', token: 'must-not-ship', url: 'https://example.test/game' }],
    },
    base,
  );
  assert.equal(displayed.rating, 0);
  assert.equal(requireWork({ ...work, rating: null, communityScore: 9 }).rating, undefined);
  assert.ok(!JSON.stringify(displayed).includes('must-not-ship'));
  assert.ok(!('communityScore' in displayed));
  assert.throws(() => publicLibraryWork({ ...work, type: 'unknown' }, base), /invalid public Work/);
  assert.throws(() => publicLibraryWork({ ...work, rating: 11 }, base), /invalid public Work/);
});

test('all eight Work types and five statuses map without Bangumi-specific assumptions', () => {
  for (const type of WORK_TYPES)
    for (const status of WORK_STATUSES) {
      const displayed = requireWork({ ...work, type, status }, base);
      assert.equal(displayed.type, type);
      assert.equal(displayed.status, status);
    }
});

test('uploaded thumbnail wins over external cover; unsafe and credential-bearing URLs are excluded', () => {
  const displayed = requireWork(
    {
      ...work,
      coverUrl: 'https://example.test/external.jpg',
      cover: { url: '/api/media/file/original.jpg', sizes: { card: { url: '/api/media/file/card.jpg' } } },
    },
    base,
  );
  assert.equal(displayed.coverUrl, `${base}/api/media/file/card.jpg`);
  assert.equal(safePublicURL('javascript:alert(1)', base), undefined);
  assert.equal(safePublicURL('https://user:secret@example.test/'), undefined);
  assert.equal(requireWork({ ...work, coverUrl: 'data:text/html,bad' }).coverUrl, undefined);
});

test('public API pagination sends no credentials, sanitizes records, and deduplicates overlap', async () => {
  const requests: URL[] = [];
  const works = await fetchLibraryWorks(base, async (input, options) => {
    const url = new URL(String(input));
    requests.push(url);
    assert.equal(options?.headers && new Headers(options.headers).has('authorization'), false);
    assert.equal(options?.credentials, undefined);
    assert.equal(url.searchParams.get('where[visibility][equals]'), 'public');
    assert.equal(url.searchParams.get('where[_status][equals]'), 'published');
    assert.equal(url.searchParams.get('draft'), 'false');
    assert.equal(url.searchParams.get('depth'), '1');
    return Response.json(
      requests.length === 1
        ? {
            docs: [
              work,
              { ...work, id: 2, visibility: 'private' },
              { ...work, id: 4, _status: 'draft', note: 'PRIVATE_DRAFT_SENTINEL' },
            ],
            hasNextPage: true,
          }
        : { docs: [work, { ...work, id: 3, slug: 'another-work' }], hasNextPage: false },
    );
  });
  assert.deepEqual(
    requests.map((url) => url.searchParams.get('page')),
    ['1', '2'],
  );
  assert.deepEqual(
    works.map((work) => work.id),
    [1, 3],
  );
});

test('configured unavailable or invalid API fails instead of silently publishing an empty Library', async () => {
  await assert.rejects(
    fetchLibraryWorks(base, async () => new Response('', { status: 503 })),
    /HTTP 503/,
  );
  await assert.rejects(
    fetchLibraryWorks(base, async () => Response.json({ docs: [], hasNextPage: true })),
    /empty page/,
  );
  await assert.rejects(
    fetchLibraryWorks(base, async () => Response.json({ docs: [] })),
    /invalid Payload page/,
  );
  await assert.rejects(fetchLibraryWorks('https://owner:secret@example.test'), /without credentials/);
});

test('Markdown associations use stable slugs, deduplicate links, and exclude drafts', () => {
  const works = [requireWork(work)];
  const linked = attachArticles(works, [
    { title: 'Article', url: '/post/article', works: ['a-game', 'a-game'] },
    { title: 'Draft', url: '/post/draft', works: ['a-game'], draft: true },
    { title: 'Other', url: '/post/other', works: ['another-work'] },
  ]);
  assert.deepEqual(linked[0].articles, [{ title: 'Article', url: '/post/article' }]);
  assert.equal(works[0].articles.length, 0);
});

test('personal dates come from experience history and creation, never release year or modification time', () => {
  const displayed = requireWork({
    ...work,
    releaseDate: '1995-07-31T00:00:00Z',
    createdAt: '2026-03-02T12:00:00Z',
    updatedAt: '2026-12-01T00:00:00Z',
    experiences: [
      { startedOn: '2026-01-01T12:00:00Z', endedOn: '2026-02-01T12:00:00Z', note: 'private-history-detail' },
      { startedOn: '2026-04-01T12:00:00Z', endedOn: '2026-04-03T12:00:00Z' },
      { startedOn: 'invalid', endedOn: null },
    ],
  });
  assert.equal(displayed.experiencedAt, '2026-04-03T12:00:00.000Z');
  assert.equal(displayed.recordedAt, '2026-03-02T12:00:00.000Z');
  assert.ok(!JSON.stringify(displayed).includes('private-history-detail'));
  assert.equal(requireWork({ ...work, createdAt: null, experiences: [] }).recordedAt, undefined);
  assert.equal(requireWork({ ...work, experiences: [{ startedOn: '2026-05-01' }] }).experiencedAt, undefined);
});

test('finished dates retain year/month/day precision and never use a later start date', () => {
  for (const endedOn of ['2020', '2020-05', '2020-05-18']) {
    const displayed = requireWork({ ...work, experiences: [{ endedOn, startedOn: '2026-10-01' }] });
    assert.equal(displayed.experiencedAt, endedOn);
  }
  assert.equal(requireWork({ ...work, experiences: [{ endedOn: '2021' }, { endedOn: '2020-12' }] }).experiencedAt, '2021');
});
