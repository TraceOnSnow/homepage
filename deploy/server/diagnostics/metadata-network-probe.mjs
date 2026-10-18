// Read-only diagnostic. Run via stdin inside the existing Payload container.
// Emits only synthetic public queries; never emits Authorization or cookies.
import dns from 'node:dns/promises';
import { performance } from 'node:perf_hooks';

const ua = 'TraceOnSnow/1.0 (https://traceonsnow.com)';
const secrets = [process.env.BGG_API_TOKEN, process.env.BANGUMI_ACCESS_TOKEN].filter(Boolean);
const redact = (text) => secrets.reduce((value, secret) => value.split(secret).join('[REDACTED]'), String(text));
const emit = (event) => process.stdout.write(redact(JSON.stringify(event)) + '\n');
const stamp = Date.now();
emit({
  event: 'runtime',
  at: new Date().toISOString(),
  node: process.version,
  credentialsPresent: { bgg: Boolean(process.env.BGG_API_TOKEN), bangumi: Boolean(process.env.BANGUMI_ACCESS_TOKEN) },
  proxyVariablesPresent: Object.fromEntries(
    ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NODE_USE_ENV_PROXY'].map((key) => [key, Boolean(process.env[key])]),
  ),
});
for (const hostname of ['api.bgm.tv', 'boardgamegeek.com']) {
  try {
    emit({ event: 'dns', at: new Date().toISOString(), hostname, addresses: await dns.lookup(hostname, { all: true }) });
  } catch (error) {
    emit({ event: 'dns', at: new Date().toISOString(), hostname, error: { name: error.name, code: error.code } });
  }
}

async function probe(
  id,
  url,
  { method = 'GET', authorized = false, token, body, accept = 'application/json', timeoutMs = 25000 } = {},
) {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const headers = { 'User-Agent': ua, Accept: accept };
  if (body) headers['Content-Type'] = 'application/json';
  if (authorized && token) headers.Authorization = `Bearer ${token}`;
  const request = {
    method,
    url,
    authorizationPresent: Boolean(headers.Authorization),
    userAgent: ua,
    accept,
    body: body || null,
    timeoutMs,
  };
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const responseBody = await response.text();
    const responseHeaders = Object.fromEntries(
      ['date', 'server', 'content-type', 'cf-ray', 'cf-cache-status', 'age', 'retry-after', 'cf-mitigated'].map((key) => [
        key,
        response.headers.get(key),
      ]),
    );
    emit({
      event: 'request',
      id,
      startedAt,
      finishedAt: new Date().toISOString(),
      elapsedMs: Math.round(performance.now() - start),
      request,
      response: {
        status: response.status,
        headers: responseHeaders,
        bodyLength: Buffer.byteLength(responseBody),
        pageTitle: responseBody.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || null,
        blockedText: /Sorry, you have been blocked/i.test(responseBody),
        bodyTruncated: responseBody.length > 131072,
      },
      responseBody: responseBody.slice(0, 131072),
    });
  } catch (error) {
    emit({
      event: 'request',
      id,
      startedAt,
      finishedAt: new Date().toISOString(),
      elapsedMs: Math.round(performance.now() - start),
      request,
      error: {
        name: error.name,
        code: error.code || null,
        message: redact(error.message),
        causeCode: error.cause?.code || null,
      },
    });
  }
}

const bangumi = async () => {
  await Promise.allSettled([
    probe('bangumi-search-authorized', 'https://api.bgm.tv/v0/search/subjects?limit=8', {
      method: 'POST',
      authorized: true,
      token: process.env.BANGUMI_ACCESS_TOKEN,
      body: { keyword: 'MyGO', sort: 'match', filter: { type: [2], nsfw: false } },
    }),
    probe('bangumi-search-anonymous', 'https://api.bgm.tv/v0/search/subjects?limit=8', {
      method: 'POST',
      body: { keyword: 'MyGO', sort: 'match', filter: { type: [2], nsfw: false } },
    }),
    probe('bangumi-detail-cacheable', 'https://api.bgm.tv/v0/subjects/8'),
    probe('bangumi-detail-unique-query', `https://api.bgm.tv/v0/subjects/8?homepage_diagnostic=${stamp}`),
  ]);
};
const bgg = async () => {
  await probe('bgg-search-authorized', 'https://boardgamegeek.com/xmlapi2/search?query=Catan&type=boardgame', {
    authorized: true,
    token: process.env.BGG_API_TOKEN,
    accept: 'application/xml',
  });
  await new Promise((resolve) => setTimeout(resolve, 5100));
  await probe('bgg-search-anonymous', 'https://boardgamegeek.com/xmlapi2/search?query=Catan&type=boardgame', {
    accept: 'application/xml',
  });
};
await Promise.allSettled([bangumi(), bgg()]);
emit({ event: 'complete', at: new Date().toISOString(), productionDataChanged: false, configurationChanged: false });
