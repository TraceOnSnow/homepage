import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workEnrichment } from './work-enrichment.mjs';

const usage = `homepage-content works|posts list|get|create|update|delete; works import FILE [--apply]; works enrich ID FILE [--apply]; works link; works|posts publish|unpublish; metadata search|details.
Examples: posts create article.json [--markdown body.md] [--apply]; posts update ID patch.json [--apply];
posts publish ID [--apply]; works link WORK_ID POST_ID [--apply].
List filters: --query TEXT --slug SLUG --link LINK --locale zh --page N --limit N.
All writes preview by default. Updates support --expected-updated-at TIMESTAMP.`;
const workFields = [
  'title',
  'slug',
  'type',
  'generateSlug',
  'aliases',
  'creators',
  'platforms',
  'cover',
  'coverUrl',
  'releaseDate',
  'description',
  'sources',
  'rating',
  'status',
  'tags',
  'note',
  'article',
  'experiences',
  'visibility',
];
const postFields = [
  'title',
  'markdown',
  'link',
  'locale',
  'publishedAt',
  'description',
  'tags',
  'cover',
  'categories',
  'frontmatter',
];

/** @param {{url: string, apiKey: string, fetcher?: typeof fetch}} configuration */
export function createContentClient({ url, apiKey, fetcher = fetch }) {
  const origin = new URL(url);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/')
    throw Error('HOMEPAGE_URL must be an origin without credentials, query or path');
  if (
    origin.protocol !== 'https:' &&
    !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
  )
    throw Error('Use HTTPS, or loopback HTTP for local development');
  if (typeof apiKey !== 'string' || apiKey.length < 32 || /\s/.test(apiKey))
    throw Error('Configure a dedicated HOMEPAGE_API_KEY');
  /**
   * @param {string} method
   * @param {string} resource
   * @param {{id?: number, query?: Record<string, string>, data?: object}} options
   */
  return async (method, resource, { id, query = {}, data } = {}) => {
    if (!['works', 'posts', 'metadata/search', 'metadata/details'].includes(resource))
      throw Error('Unsupported content resource');
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) throw Error('Unsupported HTTP method');
    if (id !== undefined && (!Number.isSafeInteger(id) || id < 1)) throw Error('Expected a positive document ID');
    const endpoint = new URL(`/api/${resource}${id === undefined ? '' : `/${id}`}`, origin);
    endpoint.search = new URLSearchParams({ depth: '0', ...query }).toString();
    const response = await fetcher(endpoint, {
      method,
      headers: { Authorization: `content-clients API-Key ${apiKey}`, 'Content-Type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(`Payload ${resource} request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return result;
  };
}

function identifier(value) {
  if (!/^\d+$/.test(value || '') || !Number.isSafeInteger(Number(value)) || Number(value) < 1)
    throw Error('Expected a positive document ID');
  return Number(value);
}

function validateData(value, resource) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected a content JSON object');
  const fields = resource === 'works' ? workFields : postFields;
  if (Object.keys(value).some((key) => !fields.includes(key)))
    throw Error('Unsupported content field; use publish/unpublish for publication status');
  if (value.markdown?.length > 1_000_000) throw Error('Markdown exceeds the Posts field limit');
  return value;
}

function readData(file, resource, markdown) {
  if (statSync(file).size > 4_100_000) throw Error('Content JSON is too large');
  const value = validateData(JSON.parse(readFileSync(file, 'utf8')), resource);
  if (markdown) {
    if (resource !== 'posts') throw Error('--markdown applies only to posts');
    if (statSync(markdown).size > 4_000_000) throw Error('Markdown file is too large');
    value.markdown = readFileSync(markdown, 'utf8');
  }
  if (Object.keys(value).length === 0) throw Error('Empty content patch');
  if (value.markdown?.length > 1_000_000) throw Error('Markdown exceeds the Posts field limit');
  return value;
}

const normalizedTitle = (value) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
const titles = (work) =>
  [work.title, ...(work.aliases || [])].filter((value) => typeof value === 'string').map(normalizedTitle);
const identities = (work) => (work.sources || []).map((source) => JSON.stringify([source.provider, source.externalId]));
// Match the CMS slug field before deduplication and readback; catalogue IDs may
// contain capitals or punctuation that Payload normalizes when saving.
const normalizedSlug = (value) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

function batchMatch(data, documents) {
  const keys = new Set(identities(data));
  const sourceMatches = documents.filter((doc) => identities(doc).some((key) => keys.has(key)));
  if (sourceMatches.length) {
    const same = sourceMatches.length === 1 && sourceMatches[0].type === data.type;
    return { outcome: same ? 'existing' : 'review', reason: same ? 'source' : 'conflicting-source', matches: sourceMatches };
  }
  const names = new Set(titles(data));
  const slugMatches = documents.filter((doc) => doc.slug === data.slug);
  const nameMatches = documents.filter((doc) => doc.type === data.type && titles(doc).some((title) => names.has(title)));
  if (slugMatches.length && !nameMatches.includes(slugMatches[0]))
    return { outcome: 'review', reason: 'slug-collision', matches: slugMatches };
  if (nameMatches.length) {
    const knownDifferent = keys.size && nameMatches.some((doc) => identities(doc).length);
    return {
      outcome: nameMatches.length === 1 && !knownDifferent ? 'existing' : 'review',
      reason: knownDifferent ? 'same-title-different-source' : 'title',
      matches: nameMatches,
    };
  }
  return null;
}

async function listAllWorks(request) {
  const documents = [];
  for (let page = 1; ; page++) {
    const result = await request('GET', 'works', { query: { limit: '100', page: String(page), draft: 'true' } });
    if (!Array.isArray(result.docs) || (result.hasNextPage && result.docs.length === 0))
      throw Error('Unexpected Works page; refusing an incomplete duplicate check');
    documents.push(...result.docs);
    if (!result.hasNextPage) return documents;
  }
}

async function importWorks(file, apply, request) {
  if (statSync(file).size > 4_100_000) throw Error('Content JSON is too large');
  const input = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(input) || input.length === 0 || input.length > 500)
    throw Error('Works import requires an array of 1–500 reviewed work objects');
  // Validate the entire manifest before issuing any mutation.
  const items = input.map((item) => {
    const data = validateData(item, 'works');
    for (const field of ['title', 'slug', 'type'])
      if (typeof data[field] !== 'string' || !data[field].trim()) throw Error(`New Works require ${field}`);
    data.slug = normalizedSlug(data.slug);
    if (!data.slug) throw Error('New Works require a usable stable slug');
    data.generateSlug ??= false;
    if (!['game', 'anime', 'book', 'movie', 'tv', 'manga', 'comic', 'boardgame'].includes(data.type))
      throw Error('Unsupported Work type');
    if (data.aliases !== undefined && (!Array.isArray(data.aliases) || data.aliases.some((value) => typeof value !== 'string')))
      throw Error('Work aliases must be strings');
    if (
      data.sources !== undefined &&
      (!Array.isArray(data.sources) ||
        data.sources.some(
          (source) =>
            !source ||
            typeof source.provider !== 'string' ||
            !source.provider ||
            typeof source.externalId !== 'string' ||
            !source.externalId,
        ))
    )
      throw Error('Work sources require provider and externalId strings');
    data.visibility ??= 'private';
    if (!Object.hasOwn(data, 'status')) data.status = 'completed';
    data._status = 'draft';
    return data;
  });
  let documents = await listAllWorks(request);
  const results = [];
  for (const [index, data] of items.entries()) {
    const match = batchMatch(data, documents);
    if (match) {
      results.push({
        index,
        title: data.title,
        outcome: match.outcome,
        reason: match.outcome === 'existing' && !match.matches[0].id ? 'duplicate-in-manifest' : match.reason,
        ids: match.matches.map((doc) => doc.id).filter(Boolean),
      });
      continue;
    }
    if (!apply) {
      results.push({ index, title: data.title, outcome: 'create', data });
      documents.push(data);
      continue;
    }
    try {
      const result = await request('POST', 'works', { data, query: latestQuery('works') });
      if (!result.doc?.id) throw Error('Unexpected create response');
      const current = await request('GET', 'works', { id: result.doc.id, query: latestQuery('works') });
      if (
        current.title !== data.title ||
        current.type !== data.type ||
        current.slug !== data.slug ||
        current.visibility !== data.visibility
      )
        throw Error('Created Work readback did not match');
      if (['rating', 'status', 'note'].some((field) => Object.hasOwn(data, field) && current[field] !== data[field]))
        throw Error('Created Work personal fields did not match');
      if (!identities(data).every((key) => identities(current).includes(key)))
        throw Error('Created Work sources did not match');
      for (const [row, experience] of (data.experiences || []).entries())
        for (const field of ['startedOn', 'endedOn'])
          if (experience[field] && current.experiences?.[row]?.[field] !== experience[field])
            throw Error('Created Work experience dates did not match');
      documents.push(current);
      results.push({ index, title: data.title, outcome: 'created', id: current.id });
    } catch (error) {
      // A timeout is not proof that POST failed. Refresh identities before the
      // next item and report this item for review; never repeat its POST.
      try {
        documents = await listAllWorks(request);
      } catch {
        throw Error('Import stopped: cannot verify content after an uncertain write; inspect existing Works before retrying');
      }
      const found = batchMatch(data, documents);
      results.push({
        index,
        title: data.title,
        outcome: 'review',
        reason: 'write-or-readback-failed',
        status: error.status,
        ids: found?.matches.map((doc) => doc.id).filter(Boolean) || [],
      });
    }
  }
  return {
    dryRun: !apply,
    resource: 'works',
    action: 'import',
    summary: Object.fromEntries(
      ['create', 'created', 'existing', 'review'].map((outcome) => [
        outcome,
        results.filter((item) => item.outcome === outcome).length,
      ]),
    ),
    results,
  };
}

function parameters(args) {
  const options = new Map();
  const positionals = [];
  const known = [
    'query',
    'slug',
    'link',
    'locale',
    'provider',
    'external-id',
    'page',
    'limit',
    'markdown',
    'expected-updated-at',
  ];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') options.set('apply', true);
    else if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      if (!known.includes(key)) throw Error(`Unknown option: ${args[i]}`);
      const value = args[++i];
      if (!value || value.startsWith('--')) throw Error(`Missing value for --${key}`);
      options.set(key, value);
    } else positionals.push(args[i]);
  }
  return { options, positionals };
}

function latestQuery(resource) {
  return ['works', 'posts'].includes(resource) ? { draft: 'true' } : {};
}
function conditions(id, updatedAt) {
  return { 'where[and][0][id][equals]': String(id), 'where[and][1][updatedAt][equals]': updatedAt, limit: '1' };
}

export async function runCLI(argv, request) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) return { usage };
  const { options, positionals } = parameters(argv);
  const [resource, action, ...args] = positionals;
  if (resource === 'metadata') {
    if (!['search', 'details'].includes(action) || args.length !== (action === 'search' ? 2 : 4)) throw Error(usage);
    const [type, q, provider, id] = args;
    return request('GET', `metadata/${action}`, { query: { type, q, ...(provider ? { provider, id } : {}) } });
  }
  if (!['works', 'posts'].includes(resource)) throw Error(usage);
  if (action === 'import') {
    if (resource !== 'works' || args.length !== 1 || options.size !== (options.has('apply') ? 1 : 0)) throw Error(usage);
    return importWorks(args[0], options.has('apply'), request);
  }
  if (action === 'list') {
    if (args.length) throw Error(usage);
    const query = { limit: '25', ...latestQuery(resource) };
    for (const [flag, field] of [
      ['query', 'title'],
      ['slug', 'slug'],
      ['link', 'link'],
      ['locale', 'locale'],
    ]) {
      if (options.has(flag)) query[`where[${field}][${flag === 'query' ? 'contains' : 'equals'}]`] = options.get(flag);
    }
    if (options.has('provider') !== options.has('external-id')) throw Error('Use --provider and --external-id together');
    if (options.has('provider')) {
      query['where[sources.provider][equals]'] = options.get('provider');
      query['where[sources.externalId][equals]'] = options.get('external-id');
    }
    for (const flag of ['page', 'limit']) if (options.has(flag)) query[flag] = String(identifier(options.get(flag)));
    return request('GET', resource, { query });
  }
  const counts = { get: 1, create: 1, update: 2, enrich: 2, delete: 1, publish: 1, unpublish: 1, link: 2 };
  if (!(action in counts) || args.length !== counts[action]) throw Error(usage);
  if (action === 'link' && resource !== 'works') throw Error('Linking applies only to works');
  if (action === 'enrich' && resource !== 'works') throw Error('Enrichment applies only to works');
  if (options.has('markdown') && !['create', 'update'].includes(action)) throw Error('--markdown requires create or update');
  if (action === 'create') {
    const data = readData(args[0], resource, options.get('markdown'));
    if (resource === 'works') {
      if (!data.slug || !data.title || !data.type) throw Error('New Works require title, type and a stable slug');
      data.visibility ??= 'private';
      if (!Object.hasOwn(data, 'status')) data.status = 'completed';
    } else {
      if (!data.title || !data.link) throw Error('New Posts require title and a stable permalink');
      data.locale ??= 'zh';
    }
    data._status = 'draft';
    const query =
      resource === 'works'
        ? { 'where[slug][equals]': data.slug, draft: 'true' }
        : { 'where[and][0][link][equals]': data.link, 'where[and][1][locale][equals]': data.locale, draft: 'true' };
    const existing = await request('GET', resource, { query: { ...query, limit: '1' } });
    if (existing.totalDocs !== 0) throw Error('Content already exists; inspect it before creating');
    if (!options.get('apply')) return { dryRun: true, resource, action, data };
    const result = await request('POST', resource, { data, query: latestQuery(resource) });
    if (!result.doc?.id) throw Error('Unexpected Payload create response; read existing content before retrying');
    return result.doc;
  }
  const id = identifier(args[0]);
  const current = await request('GET', resource, { id, query: latestQuery(resource) });
  if (action === 'get') return current;
  if (!current.updatedAt) throw Error('Missing content version; refusing to write');
  const expected = options.get('expected-updated-at') || current.updatedAt;
  if (expected !== current.updatedAt) throw Error('Content changed since review; read it again');
  let data;
  let enrichment;
  if (action === 'enrich') {
    enrichment = workEnrichment(current, readData(args[1], resource));
    data = enrichment.data;
    if (!Object.keys(data).length)
      return { resource, action, id, unchanged: true, skipped: enrichment.skipped, dryRun: !options.has('apply') };
  }
  if (action === 'update') data = readData(args[1], resource, options.get('markdown'));
  if (action === 'link') {
    const postID = identifier(args[1]);
    await request('GET', 'posts', { id: postID, query: latestQuery('posts') });
    data = { article: postID };
  }
  if (['publish', 'unpublish'].includes(action)) {
    const fields = resource === 'works' ? workFields : postFields;
    data = Object.fromEntries(fields.filter((key) => current[key] !== undefined).map((key) => [key, current[key]]));
    data._status = action === 'publish' ? 'published' : 'draft';
  }
  // Editing saves a separate draft; visibility and publication are independent choices.
  const saveDraft = ['update', 'enrich', 'link'].includes(action);
  if (saveDraft) data._status = 'draft';
  const preview = {
    resource,
    action,
    id,
    expectedUpdatedAt: expected,
    ...(data ? { data } : {}),
    ...(enrichment ? { skipped: enrichment.skipped } : {}),
  };
  if (!options.get('apply')) return { dryRun: true, ...preview };
  // Non-draft bulk operations match the base document; drafts have their own timestamps.
  const baseline = !saveDraft ? await request('GET', resource, { id }) : current;
  const refreshed = await request('GET', resource, { id, query: latestQuery(resource) });
  if (refreshed.updatedAt !== expected) throw Error('Content changed since review; read it again');
  const result = await request(action === 'delete' ? 'DELETE' : 'PATCH', resource, {
    query: { ...conditions(id, baseline.updatedAt), ...(saveDraft ? { draft: 'true' } : {}) },
    ...(data ? { data } : {}),
  });
  if (result.errors?.length) throw Error('Payload rejected the content change; read it again before retrying');
  if (!Array.isArray(result.docs) || result.docs.length !== 1) throw Error('Content changed or disappeared; read it again');
  if (enrichment) {
    const verified = await request('GET', resource, { id, query: latestQuery(resource) });
    if (
      data.sources?.some(
        (source) =>
          !verified.sources?.some(
            (saved) => saved.provider === source.provider && saved.externalId === source.externalId && saved.url === source.url,
          ),
      )
    )
      throw Error('Enrichment source readback mismatch; inspect content before retrying');
    for (const field of Object.keys(data).filter((field) => field !== 'sources')) {
      if (JSON.stringify(verified[field]) !== JSON.stringify(data[field]))
        throw Error(`Enrichment readback mismatch for ${field}; inspect content before retrying`);
    }
    for (const field of [
      'rating',
      'status',
      'note',
      'tags',
      'article',
      'experiences',
      'visibility',
      'title',
      'type',
      'slug',
      'generateSlug',
      'cover',
    ]) {
      if (JSON.stringify(verified[field]) !== JSON.stringify(current[field]))
        throw Error(`Content changed during enrichment (${field}); inspect it before retrying`);
    }
    return verified;
  }
  return result.docs[0];
}

export async function main(argv = process.argv.slice(2)) {
  try {
    if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) {
      console.log(JSON.stringify({ usage }, null, 2));
      return;
    }
    const local = path.resolve('.env.content.local');
    const file =
      process.env.HOMEPAGE_CONTENT_ENV ||
      (existsSync(local) ? local : path.join(homedir(), '.config/homepage-content/client.env'));
    if (existsSync(file)) {
      if ((statSync(file).mode & 0o077) !== 0) throw Error('Content credentials file must have mode 0600');
      process.loadEnvFile(file);
    }
    const client = createContentClient({ url: process.env.HOMEPAGE_URL, apiKey: process.env.HOMEPAGE_API_KEY });
    console.log(JSON.stringify(await runCLI(argv, client), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message, ...(error.status ? { status: error.status } : {}) }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
