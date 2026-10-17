// Compile once, sequentially. Normal F5 launches never invoke a compiler.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { occupied, runService, services } from './dev-service.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const check = process.argv.includes('--check');
const refresh = process.argv.includes('--refresh');
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, () => controller.abort());

async function ready(runtime, signal) {
  const stopped = runtime.then((code) => {
    throw Error(`临时后台已退出（${code}），请查看日志。`);
  });
  await Promise.race([
    stopped,
    (async () => {
      for (let attempt = 0; attempt < 60; attempt++) {
        if (controller.signal.aborted || signal.aborted) throw Error('准备已取消。');
        try {
          const response = await fetch('http://127.0.0.1:3000/api/works?limit=1&depth=0', {
            signal: AbortSignal.timeout(2000),
          });
          if (response.ok && Array.isArray((await response.json()).docs)) return;
          await response.body?.cancel();
        } catch {
          // A production backend should become ready without on-demand compilation.
        }
        await sleep(1000);
      }
      throw Error('后台 API 未就绪，请检查日志及已有数据库；不会自动创建或迁移数据库。');
    })(),
  ]);
}

async function build(name, config) {
  if (controller.signal.aborted) throw Error('准备已取消。');
  const code = await runService(
    name,
    { ...config, memoryFloorMiB: 768 },
    {
      signal: controller.signal,
      sampleEveryMs: 1000,
    },
  );
  if (code !== 0 || controller.signal.aborted) throw Error(`${name} 未完成（${code}），请查看日志。`);
}

async function main() {
  if (check) {
    if ([...services.site.requires, ...services.payload.requires].some((file) => !existsSync(file))) {
      throw Error('缺少生产构建。先运行任务“Homepage：准备生产试用”或 pnpm preview:prepare，再按 F5。');
    }
    console.log('生产构建已存在；本次启动不编译。修改代码后请停止服务并重新准备。');
    return;
  }
  if (refresh) {
    let response;
    try {
      response = await fetch('http://127.0.0.1:3000/api/works?limit=1&depth=0', { signal: AbortSignal.timeout(3000) });
    } catch {
      throw Error('请先启动 Payload 后台，再更新静态页面。');
    }
    if (!response.ok) throw Error('请先启动 Payload 后台，再更新静态页面。');
    await response.body?.cancel();
    await build('build-site', {
      command: 'pnpm',
      args: ['build'],
      cwd: root,
      env: { PAYLOAD_URL: 'http://127.0.0.1:3000', NODE_OPTIONS: '--max-old-space-size=2048' },
    });
    console.log('静态页面已更新；刷新浏览器即可。');
    return;
  }
  if ((await occupied(3000)) || (await occupied(4321)))
    throw Error('请先停止本地网站和 Payload，再准备生产试用。不会终止已有服务。');
  const backend = path.join(root, 'services/payload');
  if (!existsSync(path.join(backend, 'storage/payload.db')) || !existsSync(path.join(backend, '.env'))) {
    throw Error('请先准备已有后台 .env 与 storage/payload.db；不会自动初始化空库。');
  }
  process.umask(0o077);
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'homepage-preview-build-'));
  const runtimeController = new AbortController();
  const abort = () => runtimeController.abort();
  controller.signal.addEventListener('abort', abort, { once: true });
  let runtime;
  try {
    console.log('1/3 构建 Payload（一次性编译，使用临时数据库与临时密钥）。');
    await build('build-payload', {
      command: 'npm',
      args: ['run', 'build'],
      cwd: backend,
      env: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        NODE_OPTIONS: '--max-old-space-size=2048',
        DATABASE_URL: `file:${temporary}/build.db`,
        MEDIA_DIR: `${temporary}/media`,
        PAYLOAD_SECRET: 'disposable-local-build-secret-never-used-at-runtime',
        SERVER_URL: 'http://localhost:3000',
      },
    });
    if (controller.signal.aborted) throw Error('准备已取消。');
    console.log('2/3 临时启动生产后台，读取本地已有文章和作品。');
    runtime = runService('prepare-payload', services.payload, { signal: runtimeController.signal });
    await ready(runtime, runtimeController.signal);
    console.log('3/3 构建静态网站（与后台编译分开执行）。');
    await build('build-site', {
      command: 'pnpm',
      args: ['build'],
      cwd: root,
      env: { PAYLOAD_URL: 'http://127.0.0.1:3000', NODE_OPTIONS: '--max-old-space-size=2048' },
    });
    console.log('准备完成。现在可按 F5 启动“Homepage：全部服务（生产试用）”。');
  } finally {
    runtimeController.abort();
    if (runtime) await runtime;
    controller.signal.removeEventListener('abort', abort);
    rmSync(temporary, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(`[preview] ${error.message}`);
  process.exitCode = 1;
}
