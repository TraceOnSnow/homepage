import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const logRoot = path.join(root, '.cache/dev-logs');
export const services = {
  site: {
    command: process.execPath,
    args: [path.join(root, 'scripts/static-preview.mjs')],
    cwd: root,
    port: 4321,
    mode: 'production',
    requires: [path.join(root, 'dist/index.html')],
  },
  payload: {
    command: process.execPath,
    args: ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3000'],
    cwd: path.join(root, 'services/payload'),
    port: 3000,
    mode: 'production',
    env: { NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    requires: [path.join(root, 'services/payload/.next/BUILD_ID')],
  },
  'site-dev': {
    command: 'pnpm',
    args: ['dev', '--host', '127.0.0.1', '--port', '4321'],
    cwd: root,
    port: 4321,
    mode: 'development',
  },
  'payload-dev': {
    command: 'npm',
    args: ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', '3000'],
    cwd: path.join(root, 'services/payload'),
    port: 3000,
    mode: 'development',
  },
  cms: { command: 'pnpm', args: ['cms'], cwd: root, port: 4322 },
  wait: { command: process.execPath, args: [path.join(root, 'scripts/wait-for-payload.mjs')], cwd: root },
};

function memorySnapshot(group) {
  const info = Object.fromEntries(
    [...readFileSync('/proc/meminfo', 'utf8').matchAll(/^(\w+):\s+(\d+)/gm)].map(([, key, value]) => [key, Number(value)]),
  );
  const processes = [];
  for (const pid of readdirSync('/proc').filter((name) => /^\d+$/.test(name))) {
    try {
      const status = readFileSync(`/proc/${pid}/status`, 'utf8');
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      processes.push({
        pid: Number(pid),
        group: Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2]),
        name: status.match(/^Name:\s+(.+)$/m)?.[1],
        rssKiB: Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0),
      });
    } catch {
      // Processes may exit between reading the directory and their status.
    }
  }
  const own = processes.filter((item) => item.group === group);
  return {
    system: {
      memTotalKiB: info.MemTotal,
      memAvailableKiB: info.MemAvailable,
      swapTotalKiB: info.SwapTotal,
      swapFreeKiB: info.SwapFree,
    },
    service: { rssKiB: own.reduce((total, item) => total + item.rssKiB, 0), processes: own },
    topProcesses: processes.sort((a, b) => b.rssKiB - a.rssKiB).slice(0, 8),
  };
}

export function occupied(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(true);
    });
  });
}

// Exported so lifecycle verification can use tiny fixtures instead of three compilers.
export async function runService(name, config, { directory = logRoot, sampleEveryMs = 5000, signal: abortSignal } = {}) {
  process.umask(0o077);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const run = path.join(directory, `${new Date().toISOString().replaceAll(':', '-')}-${name}-${process.pid}`);
  mkdirSync(run, { mode: 0o700 });
  const event = (type, details = {}) =>
    appendFileSync(
      path.join(run, 'events.jsonl'),
      `${JSON.stringify({ time: new Date().toISOString(), type, ...details })}\n`,
      { mode: 0o600, flush: true },
    );
  writeFileSync(path.join(directory, `latest-${name}.txt`), `${run}\n`, { mode: 0o600, flush: true });
  console.log(`[local] ${name}${config.mode ? ` (${config.mode})` : ''} 日志：${run}`);
  event('start', { name, mode: config.mode, launcherPid: process.pid, node: process.version });
  if (abortSignal?.aborted) return 1;
  if (config.requires?.some((file) => !existsSync(file))) {
    console.error('[local] 缺少生产构建。请先停止试用服务，再运行 pnpm preview:prepare（或同名 VS Code 任务）。');
    event('build-missing');
    return 1;
  }
  if (config.port && (await occupied(config.port))) {
    console.error(`[local] 端口 ${config.port} 已占用，取消重复启动。请先停止原服务。`);
    event('port-occupied', { port: config.port });
    return 1;
  }
  if (abortSignal?.aborted) return 1;
  const child = spawn(config.command, config.args, {
    cwd: config.cwd,
    env: { ...process.env, ...config.env },
    stdio: ['inherit', 'pipe', 'pipe'],
    detached: true,
  });
  event('spawn', { pid: child.pid });
  let memoryStopped = false;
  const sample = () => {
    try {
      const snapshot = memorySnapshot(child.pid);
      appendFileSync(path.join(run, 'memory.jsonl'), `${JSON.stringify({ time: new Date().toISOString(), ...snapshot })}\n`, {
        mode: 0o600,
        flush: true,
      });
      if (
        config.memoryFloorMiB &&
        !memoryStopped &&
        child.exitCode === null &&
        child.signalCode === null &&
        snapshot.system.memAvailableKiB < config.memoryFloorMiB * 1024
      ) {
        memoryStopped = true;
        event('memory-pressure-stop', { availableKiB: snapshot.system.memAvailableKiB });
        console.error(`[local] 可用内存低于 ${config.memoryFloorMiB} MiB，停止本次构建；请关闭其他高内存程序后重试。`);
        cleanup('SIGTERM');
      }
    } catch (error) {
      event('memory-unavailable', { message: error.message });
    }
  };
  let sampler;
  for (const [channel, terminal] of [
    ['stdout', process.stdout],
    ['stderr', process.stderr],
  ]) {
    child[channel].on('data', (chunk) => {
      appendFileSync(
        path.join(run, 'service.log'),
        `[${new Date().toISOString()}] [${channel}] ${stripVTControlCharacters(chunk.toString())}`,
        { mode: 0o600 },
      );
      terminal.write(chunk);
    });
  }
  let killer;
  const stop = (signal) => {
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  const cleanup = (signal) => {
    stop(signal);
    killer ??= setTimeout(() => {
      event('force-stop');
      stop('SIGKILL');
    }, 3000);
  };
  const requestStop = (signal) => {
    event('stop-requested', { signal });
    cleanup(signal);
  };
  const handlers = Object.fromEntries(['SIGINT', 'SIGTERM', 'SIGHUP'].map((signal) => [signal, () => requestStop(signal)]));
  for (const [signal, handler] of Object.entries(handlers)) process.on(signal, handler);
  const abort = () => requestStop('SIGTERM');
  abortSignal?.addEventListener('abort', abort, { once: true });
  let failed = false;
  child.once('error', (error) => {
    failed = true;
    event('spawn-error', { message: error.message });
    console.error(`[local] ${name} 启动失败：${error.message}`);
  });
  child.once('exit', (code, signal) => {
    event('exit', { code, signal });
    sample();
    clearInterval(sampler);
    cleanup('SIGTERM');
    console.log(`[local] ${name} 已退出：code=${code}, signal=${signal || 'none'}；日志保留在 ${run}`);
  });
  sample();
  sampler = setInterval(sample, sampleEveryMs);
  return new Promise((resolve) =>
    child.once('close', (code, signal) => {
      clearInterval(sampler);
      // A grandchild can close its output yet remain alive; keep the kill timer referenced.
      if (killer) {
        try {
          process.kill(-child.pid, 0);
        } catch (error) {
          if (error.code === 'ESRCH') clearTimeout(killer);
        }
      }
      for (const [sig, handler] of Object.entries(handlers)) process.off(sig, handler);
      abortSignal?.removeEventListener('abort', abort);
      const result = failed || memoryStopped ? 1 : signal ? 128 + (os.constants.signals[signal] || 1) : (code ?? 1);
      event('closed', { code: result });
      resolve(result);
    }),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  if (!Object.hasOwn(services, name)) {
    console.error('Usage: node scripts/dev-service.mjs site|payload|site-dev|payload-dev|cms|wait');
    process.exitCode = 1;
  } else {
    process.exitCode = await runService(name, services[name]);
  }
}
