import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
import { projects } from '../src/data/projects.ts';

const base = process.env.READING_TEST_URL || 'http://127.0.0.1:4385';
const output = '.cache/reading-projects';
let server;
let browser;
let serverOutput = '';
await mkdir(output, { recursive: true });
try {
  if (!process.env.READING_TEST_URL) {
    server = spawn(
      'node_modules/.bin/astro',
      [
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        '4385',
        ...(process.env.READING_TEST_CONFIG ? ['--config', process.env.READING_TEST_CONFIG] : []),
      ],
      {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    server.stdout.on('data', (chunk) => {
      serverOutput += chunk;
    });
    server.stderr.on('data', (chunk) => {
      serverOutput += chunk;
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const response = await fetch(base, { signal: AbortSignal.timeout(1000) });
        await response.body?.cancel();
        if (response.ok) break;
      } catch {
        /* wait for the existing preview server */
      }
      if (server.exitCode !== null) throw Error(serverOutput);
      await sleep(200);
    }
  }
  browser = await chromium.launch();
  const results = [];
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 940 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const openNav = async (name) => {
      if (width < 993) {
        await page.locator('#mobile-menu-container button').click();
        await expect(page.locator('#mobile-drawer')).toHaveAttribute('data-state', 'open');
        const overview = page.locator('#mobile-drawer [data-sider-segmented]').getByText('站点概览', { exact: true });
        if (await overview.count()) await overview.click();
        return page.locator('#mobile-drawer [data-home-nav]').getByRole('link', { name, exact: true });
      }
      return page.locator('#site-header nav').getByRole('link', { name, exact: true });
    };
    await page.goto(base, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-projects]')).toHaveCount(0);
    const articleLink = await openNav('文章');
    await expect(articleLink).toHaveAttribute('href', '/posts');
    await articleLink.click();
    await expect(page).toHaveURL(/\/posts\/?$/);
    await expect(page.locator('.post-item-card').first()).toBeVisible();
    await expect(page.locator('[data-post-navigation] a')).toHaveCount(4);
    await page.locator('.post-item-card a:has(h2)').first().click();
    await expect(page).toHaveURL(/\/post\//);
    await expect(page.locator('.custom-content')).toBeVisible();
    assert.ok((await page.locator('.custom-content').innerText()).trim().length > 80);
    const projectLink = await openNav('项目');
    await projectLink.click();
    await expect(page).toHaveURL(/\/projects\/?$/);
    await expect(page.locator('[data-project-slug]')).toHaveCount(projects.length);
    for (const project of projects) {
      await expect(page.locator(`[data-project-slug="${project.slug}"] > a`)).toHaveAttribute('href', project.url);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: `${output}/after-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    results.push({ width, articleBodyVisible: true, projectCount: projects.length, horizontalOverflow: false, errors });
    await page.close();
  }
  const page = await browser.newPage();
  for (const locale of ['en', 'ja', 'ko']) {
    const response = await page.goto(`${base}/${locale}/projects/`);
    assert.equal(response.status(), 200);
    await expect(page.locator('[data-project-slug]')).toHaveCount(projects.length);
  }
  await page.close();
  await writeFile(`${output}/browser-report.json`, JSON.stringify({ base, results, localizedProjects: true }, null, 2));
  console.log(JSON.stringify({ passed: true, widths: results.map((row) => row.width), projectCount: projects.length }));
} finally {
  await browser?.close();
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* already closed */
    }
  }
}
