import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import matter from 'gray-matter';
import YAML from 'yaml';
import { postFile } from '../src/lib/posts/snapshot';

function publishedDate(value: unknown, file: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Expected a date-only published field (YYYY-MM-DD): ${file}`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid published date: ${file}`);
  }
  return `${value}T00:00:00+08:00`;
}

/** Prepare a new, private directory. Never change the source or replace an existing destination. */
export async function preparePersonalPosts(sourceDirectory: string, outputDirectory: string) {
  const source = await fs.realpath(sourceDirectory);
  const output = path.resolve(outputDirectory);
  const outputParent = await fs.realpath(path.dirname(output));
  const resolvedOutput = path.join(outputParent, path.basename(output));
  const nested = (parent: string, child: string) => child === parent || child.startsWith(`${parent}${path.sep}`);
  if (nested(source, resolvedOutput) || nested(resolvedOutput, source)) {
    throw new Error('Output must be separate from the source directory.');
  }
  try {
    await fs.lstat(output);
    throw new Error('Output already exists; refusing to overwrite it.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const files: string[] = [];
  async function visit(directory: string) {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isSymbolicLink()) throw new Error(`Symlinks require manual review: ${file}`);
      if (item.isDirectory()) await visit(file);
      else if (/\.mdx?$/i.test(item.name)) {
        if (item.name !== 'index.md' || directory === source) {
          throw new Error(`Expected one index.md inside each legacy article folder: ${file}`);
        }
        files.push(file);
      }
    }
  }
  await visit(source);
  if (!files.length) throw new Error('Source contains no legacy articles.');

  const names = new Set<string>();
  const prepared = await Promise.all(
    files.sort().map(async (file) => {
      const text = await fs.readFile(file, 'utf8');
      const { data, content } = matter(text, { engines: { yaml: (header) => YAML.parse(header) } });
      const link = path.basename(path.dirname(file));
      const name = postFile({ locale: 'zh', link });
      if (names.has(name)) throw new Error(`Duplicate article folder name: ${link}`);
      names.add(name);
      if (typeof data.title !== 'string' || !data.title.trim()) throw new Error(`Missing article title: ${file}`);
      if (data.lang && !['zh_CN', 'zh-CN', 'zh'].includes(data.lang)) {
        throw new Error(`Only the legacy Chinese articles are supported: ${file}`);
      }
      if (data.draft !== undefined && typeof data.draft !== 'boolean') {
        throw new Error(`Invalid draft flag: ${file}`);
      }
      if (data.category !== undefined && typeof data.category !== 'string') {
        throw new Error(`Invalid category: ${file}`);
      }
      const header = { ...data };
      delete header.published;
      delete header.category;
      delete header.lang;
      Object.assign(header, {
        title: data.title,
        link,
        date: publishedDate(data.published, file),
        categories: data.category ? [data.category] : [],
        draft: data.draft ?? false,
      });
      return {
        source: path.relative(source, file).replaceAll('\\', '/'),
        file: name,
        text: `---\n${YAML.stringify(header)}---\n${content}`,
      };
    }),
  );

  // Validate the full input before creating output; mkdir and wx also prevent races from replacing data.
  await fs.mkdir(output, { mode: 0o700 });
  for (const article of prepared) {
    await fs.writeFile(path.join(output, article.file), article.text, { flag: 'wx', mode: 0o600 });
  }
  return prepared.map(({ source: file, file: preparedFile }) => ({ source: file, file: preparedFile }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [source, output, ...extra] = process.argv.slice(2);
  if (!source || !output || extra.length) {
    throw new Error('Usage: tsx scripts/prepare-personal-posts.ts <legacy-posts-dir> <new-output-dir>');
  }
  const articles = await preparePersonalPosts(source, output);
  console.log(JSON.stringify({ articles: articles.length, output: path.resolve(output), sourceUnchanged: true }));
}
