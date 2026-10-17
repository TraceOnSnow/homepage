export { createContentClient, runCLI } from '../skills/homepage-content/scripts/content-client.mjs';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../skills/homepage-content/scripts/content-client.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
