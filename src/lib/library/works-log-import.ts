type Source = { provider: string; externalId: string; url?: string };
type RecordEntry = { title: string; category: string; fields: Record<string, string>; experiences: string[] };
type ExistingWork = Record<string, unknown> & { id: number | string; title: string; type: string; sources?: Source[] };
const types: Record<string, string> = {
  动画: 'anime',
  游戏: 'game',
  电影: 'movie',
  桌游: 'boardgame',
  剧集: 'tv',
  书籍: 'book',
  漫画: 'manga',
};

export function parseWorksLog(markdown: string): RecordEntry[] {
  const entries: RecordEntry[] = [];
  let category = '';
  let current: RecordEntry | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const section = line.match(/^## (.+)/);
    if (section) {
      category = section[1].replace(/[（(].*$/, '').trim();
      current = undefined;
      if (category === '待整理想法' || category === '后续整理建议') break;
    } else if (line.startsWith('### ')) {
      current = { title: line.slice(4).trim(), category, fields: {}, experiences: [] };
      entries.push(current);
    } else if (current) {
      const field = line.match(/^- ([^：]+)：(.*)$/);
      if (field) current.fields[field[1]] = field[2].trim();
      else if (line.startsWith('  - ')) current.experiences.push(line.slice(4).trim());
    }
  }
  return entries;
}

function sources(entry: RecordEntry, type: string): Source[] {
  return (entry.fields.来源 || '')
    .split('、')
    .filter(Boolean)
    .map((value) => {
      const separator = value.indexOf('#');
      if (separator < 1) throw Error(`Invalid source for ${entry.title}`);
      const provider = value.slice(0, separator);
      let externalId = value.slice(separator + 1);
      let url: string | undefined;
      if (provider === 'tmdb') {
        if (!externalId.includes(':')) externalId = `${type === 'tv' ? 'tv' : 'movie'}:${externalId}`;
        url = `https://www.themoviedb.org/${externalId.replace(':', '/')}`;
      } else if (provider === 'open-library') {
        externalId = externalId.replace(/^\/works\//, '');
        url = `https://openlibrary.org/works/${encodeURIComponent(externalId)}`;
      } else if (provider === 'bangumi') url = `https://bgm.tv/subject/${encodeURIComponent(externalId)}`;
      else if (provider === 'bgg') url = `https://boardgamegeek.com/boardgame/${encodeURIComponent(externalId)}`;
      else if (provider === 'anilist') url = `https://anilist.co/anime/${encodeURIComponent(externalId)}`;
      return { provider, externalId, ...(url ? { url } : {}) };
    });
}

const list = (value?: string) => [...new Set((value || '').split('、').filter(Boolean))];
const empty = (value: unknown) => value == null || value === '' || (Array.isArray(value) && !value.length);
const sourceKey = (source: Source) => `${source.provider}#${source.externalId}`;
const normalize = (title: string) => title.normalize('NFKC').toLowerCase().trim();

function experience(raw: string) {
  const [dates, state] = raw.split('；状态：');
  const [started, ended] = dates.split(' → ');
  const status = state?.replaceAll('_', '-');
  if (status && !['planned', 'in-progress', 'completed', 'on-hold', 'dropped'].includes(status))
    throw Error(`Unknown experience status: ${state}`);
  const exact = (date: string | undefined) => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
    const timestamp = `${date}T00:00:00.000Z`;
    if (new Date(timestamp).toISOString().slice(0, 10) !== date) throw Error('Invalid experience date');
    return timestamp;
  };
  return {
    status: status || null,
    note: `原始体验记录：${raw}`,
    ...(exact(started) ? { startedOn: exact(started) } : {}),
    ...(exact(ended) ? { endedOn: exact(ended) } : {}),
  };
}

export function planWorksLog(markdown: string, existing: ExistingWork[], options: { ratingScale?: 10 | 100 } = {}) {
  const ratingScale = options.ratingScale ?? 100;
  if (ratingScale !== 10 && ratingScale !== 100) throw Error('ratingScale must explicitly be 10 or 100');
  const personalRating = (entry: RecordEntry) => {
    if (entry.fields.评分 === undefined) return undefined;
    const value = Number(entry.fields.评分);
    if (!Number.isFinite(value) || value < 0 || value > ratingScale) throw Error(`Invalid rating: ${entry.title}`);
    if (ratingScale === 100) return value;
    const [coefficient, exponent = '0'] = String(value).split('e');
    return Number(`${coefficient}e${Number(exponent) + 1}`);
  };
  const creates: Array<{ title: string; data: Record<string, unknown> }> = [];
  const updates: Array<{ id: number | string; title: string; expectedUpdatedAt: unknown; data: Record<string, unknown> }> = [];
  const skipped: Array<{ title: string; reason: string }> = [];
  const warnings: Array<{ title: string; message: string }> = [];
  const records = parseWorksLog(markdown);
  for (const entry of records) {
    const type = types[entry.category];
    if (!type) {
      skipped.push({ title: entry.title, reason: `Unsupported type: ${entry.category}` });
      continue;
    }
    const refs = sources(entry, type);
    if (!refs.length) {
      skipped.push({ title: entry.title, reason: 'No unambiguous source identity' });
      continue;
    }
    const personal = entry.experiences.map(experience);
    const factual: Record<string, unknown> = {
      aliases: [...new Set([...list(entry.fields.别名), ...list(entry.fields.原始标题)])],
      creators: list(entry.fields.创作者),
      platforms: list(entry.fields.平台),
      ...(entry.fields.封面 ? { coverUrl: entry.fields.封面 } : {}),
    };
    if (entry.fields.发行年份)
      warnings.push({ title: entry.title, message: `发行年份 ${entry.fields.发行年份} 保留在原始清单；不伪造完整发行日期` });
    if (entry.experiences.some((raw) => !/^\d{4}-\d{2}-\d{2}(?: → \d{4}-\d{2}-\d{2})?；/.test(raw)))
      warnings.push({ title: entry.title, message: '不精确体验日期原文保留在体验笔记，日期字段留空' });
    if (new Set(refs.map((s) => s.provider)).size !== refs.length)
      warnings.push({ title: entry.title, message: '同一来源有多个 ID，全部原样保留，未自动选择权威条目' });
    const matches = existing.filter(
      (work) =>
        work.type === type &&
        (normalize(work.title) === normalize(entry.title) ||
          work.sources?.some((source) => refs.some((ref) => sourceKey(ref) === sourceKey(source)))),
    );
    if (matches.length > 1) {
      skipped.push({ title: entry.title, reason: 'Multiple existing identities need review' });
      continue;
    }
    if (matches.length) {
      const current = matches[0];
      if (
        normalize(current.title) !== normalize(entry.title) &&
        !list(entry.fields.别名).some((a) => normalize(a) === normalize(current.title))
      ) {
        skipped.push({ title: entry.title, reason: 'Source ID matches a different title; review identity' });
        continue;
      }
      const patch = Object.fromEntries(
        Object.entries(factual).filter(
          ([field, value]) => empty(current[field]) && !empty(value) && !(field === 'coverUrl' && current.cover),
        ),
      );
      for (const [field, value] of Object.entries({
        rating: personalRating(entry),
        status: personal.at(-1)?.status,
      })) {
        if (value !== undefined && current[field] !== value)
          warnings.push({ title: entry.title, message: `${field} 与清单不同，保留现有值` });
      }
      if (Object.keys(patch).length)
        updates.push({ id: current.id, title: current.title, expectedUpdatedAt: current.updatedAt, data: patch });
      else skipped.push({ title: entry.title, reason: 'Already exists; authored fields retained' });
      continue;
    }
    const primary = refs.find((ref) => ref.provider !== 'anilist') || refs[0];
    const slug = `${type}-${primary.provider}-${primary.externalId}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    if (existing.some((work) => work.slug === slug) || creates.some((work) => work.data.slug === slug))
      throw Error(`Slug conflict: ${slug}`);
    const rating = personalRating(entry);
    if (rating !== undefined && (!Number.isFinite(rating) || rating < 0 || rating > 100))
      throw Error(`Invalid rating: ${entry.title}`);
    creates.push({
      title: entry.title,
      data: {
        title: entry.title,
        type,
        slug,
        ...factual,
        sources: refs,
        visibility: 'public',
        status: personal.at(-1)?.status || null,
        ...(rating !== undefined ? { rating } : {}),
        ...(personal.length ? { experiences: personal } : {}),
        ...(entry.fields.备注 ? { note: entry.fields.备注 } : {}),
      },
    });
  }
  return { sourceRecords: records.length, creates, updates, skipped, warnings };
}
