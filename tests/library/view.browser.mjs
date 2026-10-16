// Read-only verification of the production-built list using actual public Works.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { fetchLibraryWorks } from '../../src/lib/library/data.ts';
import { displayDate, hasReflection, sortLibraryWorks } from '../../src/lib/library/view.ts';

const origin = process.env.LIBRARY_VIEW_ORIGIN || 'http://127.0.0.1:4331';
const works = await fetchLibraryWorks('http://127.0.0.1:3000');
const slugs = (items) => items.slice(0, 24).map((item) => item.slug);
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    const apiRequests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/works') apiRequests.push(request.url());
    });
    await page.goto(`${origin}/library/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('astro-island[component-url*="LibraryCollection"]')).not.toHaveAttribute('ssr', {
      timeout: 20000,
    });
    await expect(page).toHaveTitle(/媒体库/);
    const cards = page.locator('[data-work-slug]');
    const visibleSlugs = () => cards.evaluateAll((nodes) => nodes.map((node) => node.dataset.workSlug));
    await expect.poll(visibleSlugs).toEqual(slugs(sortLibraryWorks(works)));
    for (const work of works.slice(0, 24)) {
      const card = page.locator(`[data-work-slug=${JSON.stringify(work.slug)}]`);
      const date = displayDate(work);
      if (date) await expect(card.locator('time')).toHaveAttribute('datetime', date);
      if (work.note) await expect(card).toContainText(work.note);
    }
    const sort = page.locator('[data-library-sort]');
    for (const value of ['recorded', 'rating', 'oldest', 'title', 'experienced']) {
      await sort.selectOption(value);
      await expect.poll(visibleSlugs).toEqual(slugs(sortLibraryWorks(works, value)));
    }
    await page.locator('[data-library-reflections]').click();
    await expect.poll(visibleSlugs).toEqual(slugs(sortLibraryWorks(works.filter(hasReflection))));
    const status = works.find((work) => work.status && hasReflection(work))?.status;
    if (status) {
      await page.locator(`[data-library-status="${status}"]`).click();
      await expect
        .poll(visibleSlugs)
        .toEqual(slugs(sortLibraryWorks(works.filter((work) => hasReflection(work) && work.status === status))));
      await page.locator('[data-library-status="all"]').click();
    }
    await page.locator('[data-library-type="game"]').click();
    await expect
      .poll(visibleSlugs)
      .toEqual(slugs(sortLibraryWorks(works.filter((work) => work.type === 'game' && hasReflection(work)))));
    await page.locator('[data-library-type="all"]').click();
    await page.locator('[data-library-reflections]').click();
    await expect.poll(visibleSlugs).toEqual(slugs(sortLibraryWorks(works)));
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      'Horizontal overflow',
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(apiRequests, [], 'Static list must not fetch Works in visitors browsers');
    console.log(`PASS ${viewport.width}px: dates, five sort options, combined filters, no API requests or page errors`);
    if (process.env.LIBRARY_SCREENSHOT_DIR) {
      await page.screenshot({
        path: `${process.env.LIBRARY_SCREENSHOT_DIR}/experience-list-${viewport.width}.png`,
        fullPage: true,
      });
    }
    await context.close();
  }
} finally {
  await browser.close();
}
