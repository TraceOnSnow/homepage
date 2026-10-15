#!/usr/bin/env python3
"""Copy an existing Payload instance without changing the source or replacing a target."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile

SERVICE_ROOT = Path(__file__).resolve().parents[1]


def import_legacy(source: Path, destination: Path) -> dict:
    source, destination = source.resolve(), destination.resolve()
    database = source / 'storage/payload.db'
    if source == destination or not database.is_file():
        raise ValueError('Source must be an existing separate Payload project with storage/payload.db')
    destination.mkdir(parents=True, exist_ok=True)
    storage = destination / 'storage'
    if (storage / 'payload.db').exists() or (destination / '.env').exists():
        raise ValueError('Destination already has a database or .env; refusing to overwrite')
    if (storage / 'media').exists() and any((storage / 'media').iterdir()):
        raise ValueError('Destination media directory is not empty; refusing to overwrite')
    snapshots = sorted((SERVICE_ROOT / 'src/migrations').glob('*.json'))
    stage = Path(tempfile.mkdtemp(prefix='.legacy-import-', dir=destination))
    try:
        original = sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)
        try:
            copied = sqlite3.connect(stage / 'payload.db')
            try:
                original.backup(copied)  # Consistent snapshot, including committed WAL data.
            finally:
                copied.close()
        finally:
            original.close()
        copied = sqlite3.connect(stage / 'payload.db')
        try:
            if copied.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('Source snapshot failed SQLite integrity check')
            # Match the actual source schema, never mark future migrations applied.
            baseline = None
            for snapshot in reversed(snapshots):
                contract = json.loads(snapshot.read_text())['tables']
                matches = True
                for table, schema in contract.items():
                    columns = {row[1]: row[2].lower() for row in copied.execute(f'PRAGMA table_info("{table}")')}
                    if any(columns.get(name) != item['type'].lower() for name, item in schema['columns'].items()):
                        matches = False
                        break
                if matches:
                    baseline = snapshot.stem
                    break
            if baseline is None:
                raise ValueError('Legacy schema does not match a committed migration baseline')
            migration_names = [name for name in re.findall(r"name: '([^']+)'", (SERVICE_ROOT / 'src/migrations/index.ts').read_text()) if name <= baseline]
            if copied.execute('PRAGMA foreign_key_check').fetchone():
                raise ValueError('Source snapshot contains foreign-key violations')
            recorded = {row[0] for row in copied.execute('SELECT name FROM payload_migrations')}
            if recorded - {'dev'} - set(migration_names):
                raise ValueError('Source has unknown migration history; inspect it before importing')
            # This snapshot already has the full baseline schema. Replace only dev-mode
            # bookkeeping, so production migrate never replays CREATE TABLE on existing data.
            copied.execute("DELETE FROM payload_migrations WHERE name = 'dev'")
            now = datetime.now(timezone.utc).isoformat()
            for name in migration_names:
                if name not in recorded:
                    copied.execute('INSERT INTO payload_migrations (name, batch, created_at, updated_at) VALUES (?, 1, ?, ?)', (name, now, now))
            copied.commit()
            counts = {name: copied.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0] for name in ('works', 'users', 'media', 'posts', 'projects')}
        finally:
            copied.close()
        media = source / 'storage/media'
        if media.exists():
            shutil.copytree(media, stage / 'media')
        else:
            (stage / 'media').mkdir()
        env = (source / '.env').read_text() if (source / '.env').exists() else ''
        # Existing secrets and provider credentials stay local; never print their contents.
        lines = [line for line in env.splitlines() if not re.match(r'\s*(?:export\s+)?(?:DATABASE_URL|MEDIA_DIR|SERVER_URL)\s*=', line)]
        if not re.search(r'^\s*(?:export\s+)?PAYLOAD_SECRET\s*=', env, flags=re.M):
            import secrets
            lines.append('PAYLOAD_SECRET=' + secrets.token_hex(32))
        lines += ['DATABASE_URL=file:./storage/payload.db', 'MEDIA_DIR=./storage/media', 'SERVER_URL=http://localhost:3000']
        staged_env = stage / '.env'
        staged_env.write_text('\n'.join(lines) + '\n')
        os.chmod(staged_env, 0o600)
        os.chmod(stage / 'payload.db', 0o600)
        storage.mkdir(exist_ok=True)
        # Recheck before publishing the new local snapshot.
        if (storage / 'payload.db').exists() or (destination / '.env').exists():
            raise ValueError('Destination changed during import; refusing to overwrite')
        if (storage / 'media').exists():
            (storage / 'media').rmdir()  # Only an empty destination directory is permitted.
        (stage / 'media').rename(storage / 'media')
        (stage / 'payload.db').rename(storage / 'payload.db')
        staged_env.rename(destination / '.env')
        return counts
    finally:
        shutil.rmtree(stage)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--destination', type=Path, default=SERVICE_ROOT)
    args = parser.parse_args()
    try:
        print(json.dumps({'copied': import_legacy(args.source, args.destination)}, ensure_ascii=False))
    except (ValueError, OSError, sqlite3.Error) as error:
        parser.exit(1, f'Import stopped: {error}\n')
