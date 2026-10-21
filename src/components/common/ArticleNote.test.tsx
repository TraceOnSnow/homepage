import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArticleNote } from './ArticleNote';

const reaction = '一段需要完整阅读的作品感想。'.repeat(30);
const expansion = { expand: '展开感想', collapse: '收起感想' };

test('expandable reactions remain complete and unclamped without JavaScript', () => {
  const html = renderToStaticMarkup(<ArticleNote note={reaction} expansion={expansion} />);
  assert.ok(html.includes(reaction));
  assert.ok(!html.includes('line-clamp-3'));
  assert.ok(!html.includes('<button'));
  assert.ok(html.includes('data-article-note'));
});

test('article links and authored reactions keep their existing destinations and priority', () => {
  const html = renderToStaticMarkup(
    <ArticleNote note={reaction} article={{ title: '关联文章', url: '/post/review' }} expansion={expansion} />,
  );
  assert.ok(html.includes('href="/post/review"'));
  assert.ok(html.includes(reaction));
  assert.ok(!html.includes('关联文章'));
});

test('default consumers retain compact text, article-title fallback, and empty behavior', () => {
  assert.ok(renderToStaticMarkup(<ArticleNote note={reaction} />).includes('line-clamp-3'));
  const fallback = renderToStaticMarkup(<ArticleNote article={{ title: '关联文章', url: '/post/review' }} />);
  assert.ok(fallback.includes('关联文章'));
  assert.ok(fallback.includes('href="/post/review"'));
  assert.equal(renderToStaticMarkup(<ArticleNote note="   " />), '');
});
