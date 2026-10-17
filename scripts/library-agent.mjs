import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const usage =
  'library-agent.mjs list [--query TEXT --slug SLUG --provider NAME --external-id ID --page N --limit N] | get ID | create FILE | update ID FILE | delete ID | metadata-search TYPE QUERY | metadata-details TYPE QUERY PROVIDER ID; mutations default to dry-run, use --apply';

export function createLibraryClient({ url, token, fetcher = fetch }) {
  const origin = new URL(url);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/')
    throw Error('LIBRARY_AGENT_URL must be an origin without credentials, path or query');
  if (
    origin.protocol !== 'https:' &&
    !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
  )
    throw Error('Use HTTPS, or HTTP on loopback for local development');
  if (!token || token.length < 32)
    throw Error('Configure the dedicated LIBRARY_AGENT_TOKEN; do not use an administrator password');
  const endpoint = new URL('/api/library-agent', origin);
  return async (action, data = {}) => {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, action }),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(typeof result.error === 'string' ? result.error : 'Library request failed');
      error.status = response.status;
      throw error;
    }
    return result;
  };
}

function document(file) {
  if (statSync(file).size > 60_000) throw Error('Work JSON is too large');
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('Expected a Work JSON object');
  return data;
}

export async function runCLI(argv, request) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) return { usage };
  const flags = new Map();
  const positionals = [];
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--apply') flags.set('apply', true);
    else if (value.startsWith('--')) {
      if (!['--query', '--slug', '--provider', '--external-id', '--page', '--limit', '--expected-updated-at'].includes(value))
        throw Error(`Unknown option: ${value}`);
      const next = argv[++index];
      if (!next || next.startsWith('--')) throw Error(`Missing value: ${value}`);
      flags.set(value.slice(2), next);
    } else positionals.push(value);
  }
  const [action, ...args] = positionals;
  const counts = { list: 0, get: 1, create: 1, update: 2, delete: 1, 'metadata-search': 2, 'metadata-details': 4 };
  if (!Object.hasOwn(counts, action) || args.length !== counts[action]) throw Error(`Usage: ${usage}`);
  if (action === 'list') {
    const data = {};
    for (const [flag, field] of [
      ['query', 'q'],
      ['slug', 'slug'],
      ['provider', 'provider'],
      ['external-id', 'externalId'],
      ['page', 'page'],
      ['limit', 'limit'],
    ]) {
      if (flags.has(flag)) data[field] = ['page', 'limit'].includes(flag) ? Number(flags.get(flag)) : flags.get(flag);
    }
    return request(action, data);
  }
  if (action === 'metadata-search' || action === 'metadata-details') {
    const [type, q, provider, id] = args;
    return request(action, { type, q, ...(provider ? { provider, id } : {}) });
  }
  const id = Number(args[0]);
  if (action !== 'create' && (!Number.isSafeInteger(id) || id < 1)) throw Error('Expected a positive Work ID');
  if (action === 'get') return request(action, { id });
  const data = action === 'delete' ? undefined : document(args.at(-1));
  if (action === 'create') {
    if (!data.slug) throw Error('Specify a stable slug, and check existing Works before creating');
    const existing = await request('list', { slug: data.slug, limit: 1 });
    if (existing.totalDocs) throw Error('A Work with this slug already exists; inspect it before changing anything');
    if (!flags.get('apply')) return { dryRun: true, action, data: { visibility: 'private', status: null, ...data } };
    return request(action, { data });
  }
  const current = await request('get', { id });
  const expectedUpdatedAt = flags.get('expected-updated-at') || current.updatedAt;
  if (expectedUpdatedAt !== current.updatedAt) throw Error('Work changed since review; read it again before applying');
  const input = { id, expectedUpdatedAt, ...(data ? { data } : {}) };
  if (!flags.get('apply')) return { dryRun: true, action, ...input, current };
  return request(action, input);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length === 3 && ['--help', '-h'].includes(process.argv[2])) {
      console.log(JSON.stringify({ usage }, null, 2));
      process.exit(0);
    }
    const local = path.join(root, '.env.agent.local');
    if (existsSync(local)) process.loadEnvFile(local);
    const request = createLibraryClient({
      url: process.env.LIBRARY_AGENT_URL || 'http://127.0.0.1:3000',
      token: process.env.LIBRARY_AGENT_TOKEN,
    });
    console.log(JSON.stringify(await runCLI(process.argv.slice(2), request), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message, ...(error.status ? { status: error.status } : {}) }));
    process.exitCode = 1;
  }
}
