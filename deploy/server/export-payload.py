#!/usr/bin/env python3
"""Export a private, consistent copy; never modify source or overwrite destination.

Stop source Payload before running, to keep media and database mutually consistent.
Usage: python3 export-payload.py /local/homepage/services/payload /new/private/export
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import sys


def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    if len(sys.argv) != 3:
        raise ValueError(__doc__)
    source, destination = (Path(arg).resolve() for arg in sys.argv[1:])
    database = source / 'storage/payload.db'
    media = source / 'storage/media'
    env = source / '.env'
    if not database.is_file() or not media.is_dir() or not env.is_file():
        raise ValueError('Require existing storage/payload.db, storage/media/ and .env; no empty replacements')
    if source == destination or source in destination.parents or destination in source.parents:
        raise ValueError('Export destination must be separate from the source project')
    if not re.search(r'^\s*(?:export\s+)?PAYLOAD_SECRET\s*=\s*[^\s#]', env.read_text(), re.M):
        raise ValueError('Source PAYLOAD_SECRET is missing; refusing to invent a replacement')
    os.umask(0o077)
    destination.mkdir(parents=True, exist_ok=False)
    # A failed export is retained for inspection, never published as complete.
    with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as original:
        with sqlite3.connect(destination / 'payload.db') as copied:
            original.backup(copied)
            if copied.execute('PRAGMA integrity_check').fetchone() != ('ok',):
                raise ValueError('SQLite integrity check failed')
            if copied.execute('PRAGMA foreign_key_check').fetchone():
                raise ValueError('SQLite foreign key check failed')
            counts = {name: copied.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
                      for name in ('users', 'works', 'media')}
            if counts['users'] < 1 or counts['works'] < 1:
                raise ValueError('Expected existing administrators and works; stop and investigate')
            migrations = [row[0] for row in copied.execute('SELECT name FROM payload_migrations ORDER BY id')]
    if any(item.is_symlink() for item in media.rglob('*')):
        raise ValueError('Media contains symlinks; review before exporting')
    shutil.copytree(media, destination / 'media')
    shutil.copyfile(env, destination / 'source.env')
    manifest = {
        'source': str(source), 'counts': counts, 'migrations': migrations,
        'files': {str(file.relative_to(destination)): digest(file)
                  for file in sorted(destination.rglob('*')) if file.is_file()},
    }
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'complete': True, 'counts': counts, 'destination': str(destination)}))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, sqlite3.Error) as error:
        sys.exit(f'Export stopped: {error}')
