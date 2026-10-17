import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { services } from '../scripts/dev-service.mjs';

const moduleUrl = new URL('../scripts/dev-service.mjs', import.meta.url).href;

function fixture(config, directory) {
  const source = `import { runService } from ${JSON.stringify(moduleUrl)};
    process.exitCode = await runService('fixture', ${JSON.stringify(config)},
      { directory: ${JSON.stringify(directory)}, sampleEveryMs: 50 });`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    env: { ...process.env, TEST_PRIVATE_SENTINEL: 'never-record-this-environment-value' },
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const finished = new Promise((resolve) => child.once('close', (code) => resolve(code)));
  return { child, finished, output: () => output };
}

function logs(directory) {
  const run = readFileSync(path.join(directory, 'latest-fixture.txt'), 'utf8').trim();
  return {
    run,
    events: readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse),
  };
}

test('default services only serve production builds; hot reload is opt-in', () => {
  assert.equal(path.basename(services.site.args[0]), 'static-preview.mjs');
  assert.equal(services.payload.args[1], 'start');
  assert.equal(services.payload.env.NODE_ENV, 'production');
  assert.ok(services.site.requires.length && services.payload.requires.length);
  assert.ok(services['site-dev'].args.includes('dev'));
  assert.ok(services['payload-dev'].args.includes('dev'));
});

test('a missing production build fails without starting a compiler', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'homepage-no-build-'));
  try {
    const run = fixture(
      { command: process.execPath, args: ['-e', 'process.exit(99)'], requires: [path.join(directory, 'missing')] },
      directory,
    );
    assert.equal(await run.finished, 1);
    assert.match(run.output(), /pnpm preview:prepare/);
    assert.ok(logs(directory).events.some((e) => e.type === 'build-missing'));
    assert.ok(!logs(directory).events.some((e) => e.type === 'spawn'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a build stops on memory pressure instead of continuing until the system freezes', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'homepage-memory-guard-'));
  try {
    const run = fixture(
      {
        command: process.execPath,
        args: ['-e', 'setInterval(()=>{},1000)'],
        memoryFloorMiB: Number.MAX_SAFE_INTEGER,
      },
      directory,
    );
    assert.equal(await run.finished, 1);
    assert.ok(logs(directory).events.some((e) => e.type === 'memory-pressure-stop'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function until(condition, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (condition()) return;
    await sleep(25);
  }
  throw Error('Fixture timed out');
}

test('preserves failed service output, exit status and memory without dumping environment', { timeout: 10000 }, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'homepage-dev-log-'));
  try {
    const run = fixture(
      {
        command: process.execPath,
        args: ['-e', "console.log('hello');console.error('failure');setTimeout(()=>process.exit(23),150)"],
      },
      directory,
    );
    assert.equal(await run.finished, 23);
    const { run: folder, events } = logs(directory);
    const output = readFileSync(path.join(folder, 'service.log'), 'utf8');
    assert.match(output, /hello/);
    assert.match(output, /failure/);
    assert.ok(events.some((e) => e.type === 'exit' && e.code === 23 && e.signal === null));
    const samples = readFileSync(path.join(folder, 'memory.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(samples.length >= 2);
    assert.ok(samples[0].system.memTotalKiB > 0);
    assert.ok(samples.some((s) => s.service.rssKiB > 0 && s.service.processes.length > 0));
    for (const file of readdirSync(folder))
      assert.ok(!readFileSync(path.join(folder, file), 'utf8').includes('never-record-this-environment-value'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('records spawn failure and exits instead of leaving the memory timer running', { timeout: 10000 }, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'homepage-dev-spawn-'));
  try {
    const run = fixture({ command: path.join(directory, 'missing-command'), args: [] }, directory);
    assert.equal(await run.finished, 1);
    assert.ok(logs(directory).events.some((e) => e.type === 'spawn-error'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('refuses an occupied port without starting or killing another service', { timeout: 10000 }, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'homepage-dev-port-'));
  const server = net.createServer((socket) => socket.end());
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const run = fixture(
      { command: process.execPath, args: ['-e', 'process.exit(99)'], port: server.address().port },
      directory,
    );
    assert.equal(await run.finished, 1);
    assert.ok(logs(directory).events.some((e) => e.type === 'port-occupied'));
    assert.ok(!logs(directory).events.some((e) => e.type === 'spawn'));
    assert.ok(server.listening);
  } finally {
    server.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('records SIGKILL separately from an ordinary application exit', { timeout: 10000 }, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'homepage-dev-signal-'));
  try {
    const run = fixture(
      { command: process.execPath, args: ['-e', "setTimeout(()=>process.kill(process.pid,'SIGKILL'),100)"] },
      directory,
    );
    assert.equal(await run.finished, 137);
    assert.ok(logs(directory).events.some((e) => e.type === 'exit' && e.signal === 'SIGKILL'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('stopping the launcher cleans up a grandchild even after its parent closes output', { timeout: 12000 }, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'homepage-dev-stop-'));
  let run;
  let group;
  let grandchild;
  try {
    const pidFile = path.join(directory, 'grandchild.pid');
    const inner = `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000)`;
    const outer = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(inner)}],{stdio:'ignore'});process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)`;
    run = fixture({ command: process.execPath, args: ['-e', outer] }, directory);
    await until(() => {
      try {
        grandchild = Number(readFileSync(pidFile, 'utf8'));
        return true;
      } catch {
        return false;
      }
    });
    group = logs(directory).events.find((e) => e.type === 'spawn').pid;
    run.child.kill('SIGTERM');
    assert.equal(await run.finished, 0);
    await until(() => {
      try {
        return readFileSync(`/proc/${grandchild}/stat`, 'utf8').split(') ')[1].startsWith('Z');
      } catch {
        return true;
      }
    });
    assert.ok(logs(directory).events.some((e) => e.type === 'stop-requested' && e.signal === 'SIGTERM'));
    assert.ok(logs(directory).events.some((e) => e.type === 'force-stop'));
  } finally {
    if (group) {
      try {
        process.kill(-group, 'SIGKILL');
      } catch {}
    }
    run?.child.kill('SIGKILL');
    rmSync(directory, { recursive: true, force: true });
  }
});
