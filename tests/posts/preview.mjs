// Regression: serving an existing static build must never fetch fresh Payload inputs.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

await access('dist/index.html');
const require = createRequire(import.meta.url);
const manifest = require.resolve('astro/package.json');
const pkg = JSON.parse(await readFile(manifest, 'utf8'));
const cli = path.resolve(path.dirname(manifest), typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.astro);
let requests = 0;
const api = createServer((_request, response) => {
  requests++;
  response.writeHead(503);
  response.end('Unavailable');
});
api.listen(0, '127.0.0.1');
await once(api, 'listening');
const probe = net.createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const child = spawn(process.execPath, [cli, 'preview', '--host', '127.0.0.1', '--port', String(port)], {
  env: {
    ...process.env,
    CONTENT_SOURCE: 'payload',
    PAYLOAD_URL: `http://127.0.0.1:${api.address().port}`,
    CONTENT_BUILD_TOKEN: 'preview-only-test-credential-not-production',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: process.platform !== 'win32',
});
let output = '';
child.stdout.on('data', (chunk) => {
  output = (output + chunk).slice(-4000);
});
child.stderr.on('data', (chunk) => {
  output = (output + chunk).slice(-4000);
});
const finished = once(child, 'close');
function stop(signal) {
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    assert.equal(child.exitCode, null, output);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
      const html = await response.text();
      if (response.ok && html.includes('<html')) {
        ready = true;
        break;
      }
    } catch {
      /* Preview is still loading its configuration. */
    }
    await setTimeout(100);
  }
  assert.ok(ready, output);
  assert.equal(requests, 0, 'Preview must not request article or Works data');
  console.log('PASS: Payload-mode preview serves the existing build with no backend requests');
} finally {
  stop('SIGTERM');
  await Promise.race([finished, setTimeout(3000)]);
  stop('SIGKILL');
  api.closeAllConnections();
  await new Promise((resolve) => api.close(resolve));
}
