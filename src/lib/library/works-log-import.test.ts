import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWorksLog, planWorksLog } from './works-log-import';

const source = `# 清单
## 游戏（2）
### First
- 发行年份：2025
- 评分：0
- 来源：igdb#1、igdb#2
- 体验记录：
  - 2025；状态：completed
### Second
- 来源：igdb#3
## 桌游（1）
### Third
- 来源：bgg#4
- 体验记录：
  - 2026-08-07 → 2026-08-07；状态：completed
## 音乐（1）
### Soundtrack
- 评分：9
## 待整理想法
### 不确定的回忆
- 来源：igdb#99
`;
test('parses explicit records only and preserves uncertainty instead of inventing dates or states', () => {
  assert.equal(parseWorksLog(source).length, 4);
  const plan = planWorksLog(source, []);
  assert.equal(plan.creates.length, 3);
  assert.equal(plan.skipped.length, 1);
  const first = plan.creates[0].data;
  assert.equal(first.rating, 0);
  assert.equal(first.status, 'completed');
  assert.equal(first.releaseDate, undefined);
  assert.equal((first.sources as unknown[]).length, 2);
  const partial = (first.experiences as Array<Record<string, unknown>>)[0];
  assert.equal(partial.startedOn, undefined);
  assert.match(partial.note as string, /2025/);
  assert.equal(plan.creates[1].data.status, null);
  assert.equal((plan.creates[2].data.experiences as Array<Record<string, unknown>>)[0].endedOn, '2026-08-07T00:00:00.000Z');
});
test('matching an existing work fills facts without rewriting authored values or arrays', () => {
  const existing = {
    id: 1,
    title: 'First',
    type: 'game',
    slug: 'first',
    rating: 10,
    status: 'on-hold',
    note: '我的感想',
    experiences: [{ id: 'old', note: '旧体验' }],
    sources: [{ provider: 'igdb', externalId: '1' }],
  };
  const plan = planWorksLog(source, [existing]);
  assert.equal(plan.creates.length, 2);
  for (const update of plan.updates)
    for (const key of ['rating', 'status', 'note', 'experiences', 'sources']) assert.equal(key in update.data, false);
  assert.equal(existing.note, '我的感想');
  assert.ok(plan.warnings.some((w) => w.title === 'First' && w.message.includes('rating')));
});
test('conflicting source identities are held for review', () => {
  const plan = planWorksLog(source, [
    { id: 1, title: 'A different game', type: 'game', sources: [{ provider: 'igdb', externalId: '1' }] },
  ]);
  assert.ok(plan.skipped.some((item) => item.title === 'First' && item.reason.includes('different title')));
});

test('new lists are hundred-point and legacy ten-point imports require an explicit scale', () => {
  const markdown = '## 游戏\n### Score\n- 来源：igdb#score\n- 评分：8.37';
  assert.equal(planWorksLog(markdown, []).creates[0].data.rating, 8.37);
  assert.equal(planWorksLog(markdown, [], { ratingScale: 10 }).creates[0].data.rating, 83.7);
  assert.equal(planWorksLog(markdown.replace('8.37', '85'), []).creates[0].data.rating, 85);
  assert.throws(() => planWorksLog(markdown.replace('8.37', '85'), [], { ratingScale: 10 }), /Invalid rating/);
  assert.throws(() => planWorksLog(markdown.replace('8.37', '101'), []), /Invalid rating/);
});
