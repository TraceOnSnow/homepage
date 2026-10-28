import * as migration_20261028_120000_rating_scale_100 from './20261028_120000_rating_scale_100';
import * as migration_20261022_050000_content_trash from './20261022_050000_content_trash';
import * as migration_20260929_234416_initial from './20260929_234416_initial';
import * as migration_20260930_000715_native_slug from './20260930_000715_native_slug';
import * as migration_20261015_211157_markdown_posts from './20261015_211157_markdown_posts';
import * as migration_20261017_171808_content_clients from './20261017_171808_content_clients';
import * as migration_20261021_034349_works_drafts from './20261021_034349_works_drafts';

export const migrations = [
  {
    up: migration_20260929_234416_initial.up,
    down: migration_20260929_234416_initial.down,
    name: '20260929_234416_initial',
  },
  {
    up: migration_20260930_000715_native_slug.up,
    down: migration_20260930_000715_native_slug.down,
    name: '20260930_000715_native_slug',
  },
  {
    up: migration_20261015_211157_markdown_posts.up,
    down: migration_20261015_211157_markdown_posts.down,
    name: '20261015_211157_markdown_posts',
  },
  {
    up: migration_20261017_171808_content_clients.up,
    down: migration_20261017_171808_content_clients.down,
    name: '20261017_171808_content_clients',
  },
  {
    up: migration_20261021_034349_works_drafts.up,
    down: migration_20261021_034349_works_drafts.down,
    name: '20261021_034349_works_drafts'
  },
  { up: migration_20261022_050000_content_trash.up, down: migration_20261022_050000_content_trash.down, name: '20261022_050000_content_trash' },
  { up: migration_20261028_120000_rating_scale_100.up, down: migration_20261028_120000_rating_scale_100.down, name: '20261028_120000_rating_scale_100' },
];
