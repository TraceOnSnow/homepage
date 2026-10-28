import fs from 'node:fs/promises';
import { planWorksLog } from '../src/lib/library/works-log-import';
import { createLibraryClient } from './library-agent.mjs';

const [source, output, ...flags] = process.argv.slice(2);
const apply = flags.includes('--apply');
const ratingFlag = flags.find((flag) => flag.startsWith('--rating-scale='));
const ratingScale = Number(ratingFlag?.split('=')[1] || 100) as 10 | 100;
if (!source || !output || ![10, 100].includes(ratingScale) || flags.some((flag) => flag !== '--apply' && flag !== ratingFlag))
  throw Error('Usage: import-works-log.ts <works-log.md> <new-private-report.json> [--apply] [--rating-scale=10|100]');
try {
  process.loadEnvFile('.env.agent.local');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const request = createLibraryClient({
  url: process.env.LIBRARY_AGENT_URL || 'http://127.0.0.1:3000',
  token: process.env.LIBRARY_AGENT_TOKEN,
});
const existing = [];
for (let page = 1; page <= 1000; page++) {
  const result = await request('list', { page, limit: 100 });
  existing.push(...result.docs);
  if (!result.hasNextPage) break;
  if (page === 1000 || !result.docs.length) throw Error('Invalid or excessive pagination');
}
const plan = planWorksLog(await fs.readFile(source, 'utf8'), existing, { ratingScale });
// Persist the exact plan before the first write; refuse to overwrite a prior report.
await fs.writeFile(output, JSON.stringify({ applied: false, plan }, null, 2), { flag: 'wx', mode: 0o600 });
const completed: Array<{ action: string; id: number | string; title: string }> = [];
if (apply) {
  try {
    for (const item of plan.creates) {
      const result = await request('create', { data: item.data });
      completed.push({ action: 'create', id: result.id, title: result.title });
      await fs.writeFile(output, JSON.stringify({ applied: false, plan, completed }, null, 2));
    }
    for (const item of plan.updates) {
      const result = await request('update', { id: item.id, expectedUpdatedAt: item.expectedUpdatedAt, data: item.data });
      completed.push({ action: 'update', id: result.id, title: result.title });
      await fs.writeFile(output, JSON.stringify({ applied: false, plan, completed }, null, 2));
    }
  } catch (error) {
    await fs.writeFile(
      output,
      JSON.stringify(
        { applied: false, plan, completed, error: 'Stopped; inspect current Works and completed operations before retrying' },
        null,
        2,
      ),
    );
    throw error;
  }
  await fs.writeFile(output, JSON.stringify({ applied: true, plan, completed }, null, 2));
}
console.log(
  JSON.stringify({
    applied: Boolean(apply),
    create: plan.creates.length,
    update: plan.updates.length,
    skipped: plan.skipped.length,
    warnings: plan.warnings.length,
    report: output,
  }),
);
