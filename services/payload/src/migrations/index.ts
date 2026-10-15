import * as migration_20260929_234416_initial from './20260929_234416_initial';
import * as migration_20260930_000715_native_slug from './20260930_000715_native_slug';
import * as migration_20261015_211157_markdown_posts from './20261015_211157_markdown_posts';

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
    name: '20261015_211157_markdown_posts'
  },
];
