import fs from 'node:fs/promises';
import path from 'node:path';
import { fromZonedTime } from 'date-fns-tz';
import matter from 'gray-matter';
import { remark } from 'remark';
import YAML from 'yaml';
import { postFile } from './snapshot';

export async function readMarkdownImport(directory: string, timeZone: string) {
  const files: string[] = [];
  async function visit(folder: string) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const file = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlinks require manual import review.');
      if (entry.isDirectory()) await visit(file);
      else if (entry.name.endsWith('.mdx')) throw new Error(`MDX requires manual review: ${file}`);
      else if (entry.name.endsWith('.md')) files.push(file);
    }
  }
  await visit(directory);
  const routes = new Set<string>();
  return Promise.all(
    files.sort().map(async (file) => {
      const source = await fs.readFile(file, 'utf8');
      const { data, content } = matter(source, { engines: { yaml: (text) => YAML.parse(text) } });
      const relative = path.relative(directory, file).replaceAll('\\', '/');
      const prefix = relative.split('/')[0];
      const locale = ['en', 'ja', 'ko'].includes(prefix) ? prefix : 'zh';
      const link = data.link;
      if (typeof link !== 'string' || typeof data.title !== 'string')
        throw new Error(`Title and fixed link required: ${relative}`);
      const route = postFile({ locale: locale as 'zh', link });
      if (routes.has(route)) throw new Error(`Duplicate article path: ${relative}`);
      routes.add(route);
      // Only actual Markdown images; examples inside code blocks are not dependencies.
      const tree = remark().parse(content);
      const inspect = (node: { type: string; url?: string; children?: unknown[] }) => {
        if (node.type === 'image' && node.url && !/^(?:https?:\/\/|\/|data:)/.test(node.url))
          throw new Error(`Relative image requires migration: ${relative}`);
        for (const child of node.children ?? []) inspect(child as typeof node);
      };
      inspect(tree);
      const date = String(data.date || '');
      const publishedAt = /(?:Z|[+-]\d\d:\d\d)$/i.test(date)
        ? new Date(date).toISOString()
        : fromZonedTime(date, timeZone).toISOString();
      const frontmatter = { ...data };
      for (const key of ['title', 'link', 'date', 'draft', 'tags', 'description', 'categories', 'works'])
        delete frontmatter[key];
      return {
        file: relative,
        data: {
          title: data.title as string,
          link,
          locale: locale as 'zh' | 'en' | 'ja' | 'ko',
          markdown: content,
          publishedAt,
          description: data.description as string | undefined,
          tags: data.tags as string[] | undefined,
          categories: data.categories,
          frontmatter,
          _status: data.draft ? ('draft' as const) : ('published' as const),
        },
        works: (data.works ?? []) as string[],
      };
    }),
  );
}
