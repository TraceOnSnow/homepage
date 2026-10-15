import * as migration_20260929_234416_initial from './20260929_234416_initial';
import * as migration_20260930_000715_native_slug from './20260930_000715_native_slug';

export const migrations = [
  {
    up: migration_20260929_234416_initial.up,
    down: migration_20260929_234416_initial.down,
    name: '20260929_234416_initial',
  },
  {
    up: migration_20260930_000715_native_slug.up,
    down: migration_20260930_000715_native_slug.down,
    name: '20260930_000715_native_slug'
  },
];
