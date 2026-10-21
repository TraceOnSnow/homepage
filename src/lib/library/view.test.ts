import assert from 'node:assert/strict';
import test from 'node:test';
import type { LibraryWork } from './types';
import {
  DEFAULT_LIBRARY_VIEW,
  displayDate,
  formatLibraryDate,
  hasReflection,
  matchesLibraryQuery,
  readLibraryView,
  sortLibraryWorks,
  writeLibraryView,
} from './view';

const work = (slug: string, fields: Partial<LibraryWork> = {}): LibraryWork => ({
  id: slug,
  slug,
  title: slug,
  type: 'game',
  articles: [],
  ...fields,
});

test('default order follows personal experience, falling back to added date without mutating input', () => {
  const works = [
    work('experienced', { experiencedAt: '2026-05-01', recordedAt: '2026-01-01' }),
    work('newly-added', { recordedAt: '2026-06-01' }),
    work('unknown'),
    work('old-experience', { experiencedAt: '2025-01-01', recordedAt: '2026-07-01' }),
  ];
  assert.deepEqual(
    sortLibraryWorks(works).map((item) => item.slug),
    ['newly-added', 'experienced', 'old-experience', 'unknown'],
  );
  assert.equal(works[0].slug, 'experienced');
  assert.equal(sortLibraryWorks(works, 'recorded')[0].slug, 'old-experience');
  assert.equal(sortLibraryWorks(works, 'oldest')[0].slug, 'old-experience');
  assert.equal(sortLibraryWorks(works, 'oldest').at(-1)?.slug, 'unknown');
  assert.equal(displayDate(works[0]), '2026-05-01');
});

test('reflection filter includes a short note or actual article and does not count blank notes', () => {
  assert.equal(hasReflection(work('blank', { note: '  ' })), false);
  assert.equal(hasReflection(work('short', { note: '我大概一辈子也忘不了mygo了' })), true);
  assert.equal(hasReflection(work('long', { articles: [{ title: '感想文章', url: '/post/review' }] })), true);
});

test('rating sort preserves zero and dates use the configured site timezone', () => {
  const sorted = sortLibraryWorks([work('unrated'), work('zero', { rating: 0 }), work('high', { rating: 9 })], 'rating');
  assert.deepEqual(
    sorted.map((item) => item.slug),
    ['high', 'zero', 'unrated'],
  );
  assert.equal(formatLibraryDate('2026-01-01T20:00:00Z', 'en-CA', 'Asia/Shanghai'), '2026-01-02');
  assert.equal(formatLibraryDate('2020', 'zh', 'Asia/Shanghai'), '2020');
  assert.equal(formatLibraryDate('2020-05', 'en', 'America/Chicago'), '2020-05');
  assert.equal(formatLibraryDate('2020-05-18', 'en', 'America/Chicago'), '2020-05-18');
});

test('search finds public titles, reactions and linked article titles with normalized terms', () => {
  const item = work('sample', {
    title: 'ＡＢＣ 游戏',
    note: '第二次体验，很喜欢配乐',
    articles: [{ title: 'Revisiting the ending', url: '/post/ending' }],
  });
  assert.equal(matchesLibraryQuery(item, ' abc   配乐 '), true);
  assert.equal(matchesLibraryQuery(item, 'REVISITING'), true);
  assert.equal(matchesLibraryQuery(item, '配乐 missing'), false);
  assert.equal(matchesLibraryQuery(work('empty'), '   '), true);
});

test('shareable view state validates filters and preserves unrelated query parameters', () => {
  assert.deepEqual(readLibraryView(new URLSearchParams('type=unknown&status=other&sort=wrong&page=-2')), DEFAULT_LIBRARY_VIEW);
  for (const invalid of ['NaN', 'Infinity', '2.4', '9007199254740992']) {
    assert.equal(readLibraryView(new URLSearchParams({ page: invalid })).page, 1);
  }
  const view = {
    ...DEFAULT_LIBRARY_VIEW,
    type: 'book' as const,
    status: 'completed' as const,
    sort: 'rating' as const,
    reflections: true,
    q: '感想 & Books',
    page: 2,
  };
  const params = writeLibraryView(new URLSearchParams('utm_source=friend'), view);
  assert.deepEqual(readLibraryView(params), view);
  assert.equal(params.get('utm_source'), 'friend');
  assert.equal(writeLibraryView(params, DEFAULT_LIBRARY_VIEW).toString(), 'utm_source=friend');
});
