import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { readMarkdownImport } from '../src/lib/posts/import';

const [directory, output] = process.argv.slice(2);
if (!directory || !output) throw new Error('Usage: pnpm content:plan <Markdown-directory> <new-private-plan.json>');
const site = YAML.parse(await fs.readFile('config/site.yaml', 'utf8'));
const plan = await readMarkdownImport(path.resolve(directory), site.site.timezone || 'Asia/Shanghai');
await fs.writeFile(output, JSON.stringify(plan), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ articles: plan.length, plan: path.resolve(output), sourceUnchanged: true }));
