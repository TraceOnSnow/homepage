import { defaultCoverList } from '@lib/config/site';
import { createCoverPoolLoader } from './pool';

// Build/server only: visitors receive image URLs, with no API client or backend credentials.
export const loadArticleCoverPool = createCoverPoolLoader({
  fallback: defaultCoverList,
  snapshot: import.meta.env.CONTENT_BUILD_SNAPSHOT,
  base: import.meta.env.PAYLOAD_URL,
  payloadMode: import.meta.env.CONTENT_SOURCE === 'payload',
  development: import.meta.env.DEV,
});
