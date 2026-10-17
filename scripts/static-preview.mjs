// Serve built files only. Skip Astro's config, content sync and compilation integrations.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const server = await preview({
  root,
  configFile: false,
  appType: 'mpa',
  plugins: [
    {
      name: 'astro-static-directory-indexes',
      configurePreviewServer({ middlewares }) {
        middlewares.use((request, _response, next) => {
          // Match Astro/Nginx directory routes, with or without a trailing slash.
          try {
            const url = new URL(request.url, 'http://localhost');
            const directory = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
            if (
              (directory === dist || directory.startsWith(`${dist}${path.sep}`)) &&
              existsSync(path.join(directory, 'index.html'))
            ) {
              request.url = `${url.pathname.replace(/\/$/, '')}/index.html${url.search}`;
            }
          } catch {
            /* Let Vite handle malformed URLs. */
          }
          next();
        });
      },
    },
  ],
  build: { outDir: 'dist' },
  preview: { host: '127.0.0.1', port: 4321, strictPort: true, open: false },
});
console.log('静态生产试用：只提供 dist/ 文件，不编译；内容更新后请运行 pnpm preview:refresh。');
server.printUrls();
