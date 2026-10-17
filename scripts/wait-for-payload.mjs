// Used by VS Code before Astro starts, including when articles come from Payload.
import { setTimeout } from 'node:timers/promises';

const url = 'http://127.0.0.1:3000/api/works?limit=1&depth=0';
const deadline = Date.now() + 120_000;
let lastStatus = '尚未连接';
console.log('等待 Payload API 就绪（最多 120 秒）……');
while (Date.now() < deadline) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    lastStatus = `HTTP ${response.status}`;
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.docs)) {
        console.log('Payload API 已就绪。');
        process.exit(0);
      }
      lastStatus = '返回内容不是 Works API 数据';
    } else {
      await response.body?.cancel();
    }
  } catch {
    // Next.js may still be compiling its first API request.
  }
  await setTimeout(1000);
}
console.error(`Payload API 未就绪（${lastStatus}）。请查看后台终端；若提示缺表或缺列，先按文章迁移说明处理本地数据库。`);
console.error('启动配置不会自动安装依赖、创建空库、执行迁移或导入文章。');
process.exit(1);
