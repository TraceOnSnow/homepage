import assert from 'node:assert/strict';
import test from 'node:test';
import { publicLibraryWork } from '../library/data';
import type { LibraryWork } from '../library/types';
import { articleCoverIdentity, resolveArticleCover } from './data';

const pool = ['/img/cover/1.webp', '/img/cover/2.webp', '/img/cover/3.webp'];
const work: LibraryWork = {
  id: 1,
  slug: 'a-game',
  title: 'A game',
  type: 'game',
  coverUrl: 'https://images.example.test/portrait.jpg',
  articleId: 7,
  articles: [],
};

test('explicit article artwork wins; canonical relationships support translated Payload IDs', () => {
  const post = { slug: 'review', payloadId: 8, payloadIds: [7, 8] };
  assert.deepEqual(resolveArticleCover(post, [work], pool, true), { src: work.coverUrl, source: 'work' });
  assert.deepEqual(resolveArticleCover({ ...post, cover: '/manual.webp' }, [work], pool, true), {
    src: '/manual.webp',
    source: 'manual',
  });
  assert.deepEqual(resolveArticleCover(post, [{ ...work, articleId: '7' }], pool, true).source, 'work');
});

test('files-mode explicit Work slugs remain compatible; Payload never revives stale slug or title matches', () => {
  const post = { slug: 'a-game', title: 'A game', works: ['a-game'] };
  assert.equal(resolveArticleCover(post, [work], pool, false).source, 'work');
  assert.equal(resolveArticleCover(post, [work], pool, true).source, 'pool');
  assert.equal(resolveArticleCover({ slug: 'a-game' }, [work], pool, false).source, 'pool');
  assert.equal(resolveArticleCover({ slug: 'review', payloadId: 42 }, [work], pool, true).source, 'pool');
});

test('public-Work sanitation keeps private, unpublished and trashed artwork out of article cards', () => {
  const input = { ...work, coverUrl: 'https://images.example.test/private.jpg', visibility: 'public', _status: 'published' };
  const works = [
    { ...input, visibility: 'private' },
    { ...input, _status: 'draft' },
    { ...input, deletedAt: '2026-01-01T00:00:00Z' },
  ]
    .map((doc) => publicLibraryWork(doc, 'https://cms.example.test'))
    .filter((doc): doc is LibraryWork => Boolean(doc));
  assert.equal(resolveArticleCover({ slug: 'review', payloadId: 7 }, works, pool, true).source, 'pool');
});

test('generic artwork is stable across list order, pagination, title edits and translation fallback', () => {
  const post = { slug: 'review', link: 'stable-review' };
  const first = resolveArticleCover(post, [], pool, true);
  for (let index = 0; index < 10; index++) {
    resolveArticleCover({ slug: `unrelated-${index}` }, [], pool, true);
    const edited = { ...post, title: `edited-${index}` };
    assert.deepEqual(resolveArticleCover(edited, [], pool, true), first);
  }
  assert.equal(articleCoverIdentity({ slug: 'en/review', payloadId: 8, payloadIds: [8, 7] }), 'payload:7');
  assert.equal(articleCoverIdentity({ slug: 'review', payloadId: 7, payloadIds: [7, 8] }), 'payload:7');
  assert.throws(() => resolveArticleCover(post, [], [], true), /at least one/);
});

test('multiple explicitly related Works choose the canonical relation then stable slug, independent of API order', () => {
  const other = { ...work, id: 2, slug: 'z-game', coverUrl: 'https://images.example.test/wide.jpg' };
  const legacy = { ...work, id: 3, slug: '0-legacy', articleId: 99 };
  const post = { slug: 'review', payloadId: 7, works: ['0-legacy'] };
  assert.deepEqual(resolveArticleCover(post, [legacy, other, work], pool, false), {
    src: work.coverUrl,
    source: 'work',
  });
  assert.deepEqual(
    resolveArticleCover(post, [work, other, legacy], pool, false),
    resolveArticleCover(post, [legacy, work, other], pool, false),
  );
  assert.equal(resolveArticleCover(post, [{ ...work, coverUrl: undefined }], pool, true).source, 'pool');
});
