import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const usage = `homepage-content works|posts list|get|create|update|delete; works link; posts publish|unpublish; metadata search|details.
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

function readData(file, resource, markdown) {
  if (statSync(file).size > 4_100_000) throw Error('Content JSON is too large');
  const value = JSON.parse(readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Expected a content JSON object');
  const fields = resource === 'works' ? workFields : postFields;
  if (Object.keys(value).some((key) => !fields.includes(key)))
    throw Error('Unsupported content field; use publish/unpublish for article status');
  if (markdown) {
    if (resource !== 'posts') throw Error('--markdown applies only to posts');
    if (statSync(markdown).size > 4_000_000) throw Error('Markdown file is too large');
    value.markdown = readFileSync(markdown, 'utf8');
  }
  if (Object.keys(value).length === 0) throw Error('Empty content patch');
  if (value.markdown?.length > 1_000_000) throw Error('Markdown exceeds the Posts field limit');
  return value;
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
  return resource === 'posts' ? { draft: 'true' } : {};
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
  const counts = { get: 1, create: 1, update: 2, delete: 1, publish: 1, unpublish: 1, link: 2 };
  if (!(action in counts) || args.length !== counts[action]) throw Error(usage);
  if (['publish', 'unpublish'].includes(action) && resource !== 'posts') throw Error('Publishing applies only to posts');
  if (action === 'link' && resource !== 'works') throw Error('Linking applies only to works');
  if (options.has('markdown') && !['create', 'update'].includes(action)) throw Error('--markdown requires create or update');
  if (action === 'create') {
    const data = readData(args[0], resource, options.get('markdown'));
    if (resource === 'works') {
      if (!data.slug || !data.title || !data.type) throw Error('New Works require title, type and a stable slug');
      data.visibility ??= 'private';
      data.status ??= null;
    } else {
      if (!data.title || !data.link) throw Error('New Posts require title and a stable permalink');
      data.locale ??= 'zh';
      data._status = 'draft';
    }
    const query =
      resource === 'works'
        ? { 'where[slug][equals]': data.slug }
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
  if (action === 'update') data = readData(args[1], resource, options.get('markdown'));
  if (action === 'link') {
    const postID = identifier(args[1]);
    await request('GET', 'posts', { id: postID, query: latestQuery('posts') });
    data = { article: postID };
  }
  if (action === 'publish') {
    data = Object.fromEntries(postFields.filter((key) => current[key] !== undefined).map((key) => [key, current[key]]));
    data._status = 'published';
  }
  if (action === 'unpublish') data = { _status: 'draft' };
  // Editing a published article saves a separate draft; publication is an explicit action.
  const saveDraft = resource === 'posts' && action === 'update';
  if (saveDraft) data._status = 'draft';
  const preview = { resource, action, id, expectedUpdatedAt: expected, ...(data ? { data } : {}) };
  if (!options.get('apply')) return { dryRun: true, ...preview };
  // Non-draft bulk operations match the base document; drafts have their own timestamps.
  const baseline = resource === 'posts' && !saveDraft ? await request('GET', resource, { id }) : current;
  const refreshed = await request('GET', resource, { id, query: latestQuery(resource) });
  if (refreshed.updatedAt !== expected) throw Error('Content changed since review; read it again');
  const result = await request(action === 'delete' ? 'DELETE' : 'PATCH', resource, {
    query: { ...conditions(id, baseline.updatedAt), ...(saveDraft ? { draft: 'true' } : {}) },
    ...(data ? { data } : {}),
  });
  if (result.errors?.length) throw Error('Payload rejected the content change; read it again before retrying');
  if (!Array.isArray(result.docs) || result.docs.length !== 1) throw Error('Content changed or disappeared; read it again');
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
