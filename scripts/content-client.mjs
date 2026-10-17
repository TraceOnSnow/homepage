export { createContentClient, runCLI } from '../skills/homepage-content/scripts/content-client.mjs';

import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { main } from '../skills/homepage-content/scripts/content-client.mjs';

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
