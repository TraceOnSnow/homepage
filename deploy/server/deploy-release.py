#!/usr/bin/env python3
"""Deploy an approved commit/image; never migrate, import, or restore user data."""
import argparse
import datetime
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import sqlite3
import subprocess
import sys
import time

BASE = Path(__file__).resolve().parent
MIGRATIONS = 'services/payload/src/migrations'
IMAGE_PATTERN = r'ghcr\.io/traceonsnow/homepage-payload@sha256:[0-9a-f]{64}'
WORKS_DRAFT_MIGRATION = '20261021_034349_works_drafts'
CONTENT_TRASH_MIGRATION = '20261022_050000_content_trash'
RATING_SCALE_MIGRATION = '20261028_120000_rating_scale_100'
RATING_SCALE_MARKER = 'data:personal-rating-scale:100:v1'


def validate_release(commit, image):
    if not re.fullmatch(r'[0-9a-f]{40}', commit) or not re.fullmatch(IMAGE_PATTERN, image):
        raise ValueError('Expected a full commit SHA and the homepage image pinned by digest')


def run(args, cwd, *, capture=False, timeout=300):
    # Keep Compose configuration (which contains secrets) and subprocess output out of exceptions.
    process = subprocess.Popen(args, cwd=cwd, text=True, start_new_session=True,
                               stdout=subprocess.PIPE if capture else None,
                               stderr=subprocess.PIPE if capture else None)
    try:
        stdout, _ = process.communicate(timeout=timeout)
    except BaseException:
        # Stop npm's entire process tree before a rollback changes its files.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.communicate()
        raise
    if process.returncode:
        raise RuntimeError(f'{args[0]} command failed (exit {process.returncode}); inspect private server logs')
    return stdout.rstrip('\n') if capture else None


def git(repo, *args):
    return run(['git', *args], repo, capture=True)


def migration_sources(repo, commit):
    index = git(repo, 'show', f'{commit}:{MIGRATIONS}/index.ts')
    names = re.findall(r"\bname:\s*['\"]([\w-]+)['\"]", index)
    registered = re.findall(r"import \* as \w+ from ['\"]\./([\w-]+)['\"]", index)
    files = git(repo, 'ls-tree', '--name-only', f'{commit}:{MIGRATIONS}').splitlines()
    sources = {name[:-3] for name in files if name.endswith('.ts') and name != 'index.ts'}
    if not names or len(names) != len(set(names)) or set(names) != set(registered) or set(names) != sources:
        raise ValueError('Unrecognized migration registry; review it before deployment')
    return {name: git(repo, 'show', f'{commit}:{MIGRATIONS}/{name}.ts') for name in names}


def check_release_compatibility(database, target):
    """Never serve a migrated Works database with the legacy visibility-only API.

    Check the physical schema too: an interrupted migration bookkeeping step
    cannot authorize a legacy release. This guard never edits the database.
    """
    if not database.is_file():
        raise ValueError('Existing database is required; refusing to create a replacement')
    with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as connection:
        applied = {row[0] for row in connection.execute('SELECT name FROM payload_migrations')}
        columns = {row[1] for row in connection.execute('PRAGMA table_info(works)')}
        trash_schema = any(
            column in {row[1] for row in connection.execute(f'PRAGMA table_info({table})')}
            for table, column in [('works', 'deleted_at'), ('cms_posts', 'deleted_at'),
                                  ('_works_v', 'version_deleted_at'), ('_cms_posts_v', 'version_deleted_at')])
        versions = connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_works_v'").fetchone()
    if (RATING_SCALE_MIGRATION in applied or RATING_SCALE_MARKER in applied) and RATING_SCALE_MIGRATION not in target:
        raise ValueError('Legacy release would misinterpret hundred-point ratings; use a reviewed 0–100-compatible release')
    if (CONTENT_TRASH_MIGRATION in applied or trash_schema) and CONTENT_TRASH_MIGRATION not in target:
        raise ValueError('Legacy release would expose trashed content; retain the schema and use a reviewed Trash-compatible release')
    if (WORKS_DRAFT_MIGRATION in applied or '_status' in columns or versions) and WORKS_DRAFT_MIGRATION not in target:
        raise ValueError('Legacy release would bypass Work draft privacy; retain the schema and use a reviewed draft-compatible release')


def check_migrations(database, target, previous):
    check_release_compatibility(database, target)
    with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as connection:
        history = [row[0] for row in connection.execute('SELECT name FROM payload_migrations ORDER BY id')]
        if (RATING_SCALE_MIGRATION in history) != (RATING_SCALE_MARKER in history):
            raise ValueError('Incomplete rating-scale migration bookkeeping; complete the reviewed manual migration first')
        applied = [name for name in history if name != RATING_SCALE_MARKER]
        if connection.execute('PRAGMA quick_check').fetchone() != ('ok',):
            raise ValueError('Database integrity check failed')
    if applied != list(target):
        raise ValueError('Database migrations differ from the release; complete the reviewed manual migration first')
    if any(name not in target or target[name] != source for name, source in previous.items()):
        raise ValueError('An existing migration was changed or removed; manual review is required')


def write_private(path, text):
    temp = path.with_name(path.name + '.next')
    with temp.open('w') as stream:
        os.chmod(temp, 0o600)
        stream.write(text)
    os.replace(temp, path)


def set_current(base, target):
    link = base / 'public/.current-deployment'
    link.unlink(missing_ok=True)
    link.symlink_to(target)
    os.replace(link, base / 'public/current')


class Deployment:
    def __init__(self, base):
        self.base = base
        self.repo = base.parent / 'homepage'
        self.override = base / 'compose.release.yaml'
        self.compose = ['docker', 'compose', '--env-file', 'runtime.env', '-f', 'compose.yaml']

    def up(self, image):
        write_private(self.override, json.dumps({'services': {
            'payload': {'image': image}, 'migrate': {'image': image}}}) + '\n')
        run([*self.compose, '-f', self.override.name, 'up', '-d', '--no-build', '--pull', 'never',
             '--wait', '--wait-timeout', '180', 'payload'], self.base)

    def stop(self):
        override = ['-f', self.override.name] if self.override.is_file() else []
        run([*self.compose, *override, 'stop', 'payload'], self.base)

    def install_dependencies(self):
        run(['/usr/bin/npm', 'exec', '--yes', '--package=pnpm@10.28.2', '--', 'pnpm',
             'install', '--frozen-lockfile'], self.repo, timeout=600)

    def restore_generated_cache(self):
        # Only this explicitly generated, tracked file may be reset by deployment.
        git(self.repo, 'restore', '--source=HEAD', '--worktree', '--', '.cache/og-data.json')

    def publish(self):
        spec = importlib.util.spec_from_file_location('release_publisher', self.base / 'publish-library.py')
        publisher = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(publisher)
        publisher.BASE, publisher.REPO = self.base, self.repo
        publisher.STATE = self.base / 'evidence/library-publication.json'
        # The caller holds the same publication lock used by the content timer.
        deadline = time.monotonic() + 900
        while not publisher.publish(refresh=True):
            if time.monotonic() >= deadline:
                raise RuntimeError('Content did not settle within 15 minutes; deployment will roll back')
            time.sleep(15)

    def execute(self, commit, image):
        validate_release(commit, image)
        if not (self.base / 'runtime.env').is_file() or not (self.base / 'compose.yaml').is_file():
            raise ValueError('Install the reviewed server configuration before enabling deployment')
        current = self.base / 'public/current'
        if (not current.is_symlink() or not current.resolve().is_dir()
                or not current.resolve().is_relative_to((self.base / 'public/releases').resolve())):
            raise ValueError('Existing static release symlink is required')
        # The only ignored tracked change is Koharu's generated OG metadata cache.
        dirty = git(self.repo, 'status', '--porcelain', '--untracked-files=normal').splitlines()
        if any(line[3:] != '.cache/og-data.json' or line[0] != ' ' for line in dirty):
            raise ValueError('Production checkout has local edits; preserve and review them first')
        previous_commit = git(self.repo, 'rev-parse', 'HEAD')
        git(self.repo, 'fetch', 'origin', 'main')
        git(self.repo, 'merge-base', '--is-ancestor', commit, 'origin/main')
        target = migration_sources(self.repo, commit)
        previous = migration_sources(self.repo, previous_commit)
        configuration = json.loads(run([*self.compose, 'config', '--format', 'json'], self.base, capture=True))
        service = configuration['services']['payload']
        mounts = {mount['target']: mount for mount in service['volumes']}
        database_mount = mounts['/app/storage/database']
        media_mount = mounts['/app/storage/media']
        if database_mount['type'] != 'bind' or media_mount['type'] != 'bind':
            raise ValueError('Existing database and media bind mounts are required')
        environment = service['environment']
        if (environment.get('DATABASE_URL') != 'file:/app/storage/database/payload.db'
                or environment.get('MEDIA_DIR') != '/app/storage/media'
                or not Path(media_mount['source']).is_dir()):
            raise ValueError('Unexpected production storage configuration')
        database = Path(database_mount['source']).resolve() / 'payload.db'
        check_migrations(database, target, previous)
        cid = run([*self.compose, 'ps', '--quiet', 'payload'], self.base, capture=True)
        if not cid or '\n' in cid:
            raise ValueError('Exactly one running Payload container is required')
        container = json.loads(run(['docker', 'inspect', cid], self.base, capture=True))[0]
        actual_mounts = {mount['Destination']: mount['Source'] for mount in container['Mounts']}
        if any(Path(actual_mounts.get(path, '/nonexistent')).resolve() != Path(mounts[path]['source']).resolve()
               for path in ('/app/storage/database', '/app/storage/media')):
            raise ValueError('Running container storage differs from Compose; review before deployment')
        old_image = container['Image']  # Immutable local image ID, including pre-GHCR installations.
        run(['docker', 'pull', image], self.base)
        inspected = json.loads(run(['docker', 'image', 'inspect', image], self.base, capture=True))[0]
        architecture = run(['docker', 'version', '--format', '{{.Server.Arch}}'], self.base, capture=True)
        if (inspected['Architecture'] != architecture or inspected['Os'] != 'linux'
                or inspected['Config'].get('Labels', {}).get('org.opencontainers.image.revision') != commit
                or inspected['Config'].get('Labels', {}).get('org.opencontainers.image.source')
                != 'https://github.com/TraceOnSnow/homepage'):
            raise ValueError('Image architecture or source revision does not match this release')
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup = self.base / 'evidence/deployments' / stamp
        backup.mkdir(parents=True, mode=0o700)
        with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as original:
            with sqlite3.connect(backup / 'payload.db') as copied:
                original.backup(copied)
                if copied.execute('PRAGMA integrity_check').fetchone() != ('ok',):
                    raise ValueError('Pre-deployment SQLite snapshot failed integrity check')
        tracked = ['compose.release.yaml', 'publish-library.py', 'evidence/library-publication.json',
                   'evidence/library-pending.json', 'evidence/deployment.json']
        saved = {name: (self.base / name).read_bytes() if (self.base / name).exists() else None for name in tracked}
        for index, (name, value) in enumerate(saved.items()):
            if value is not None:
                (backup / f'previous-{index}').write_bytes(value)
        old_site = os.readlink(current)
        record = {'commit': commit, 'image': image, 'previous_commit': previous_commit,
                  'previous_image': old_image, 'previous_site': old_site, 'backup': str(backup),
                  'previous_files': {name: f'previous-{index}' for index, name in enumerate(saved)}}
        write_private(backup / 'release.json', json.dumps(record, indent=2) + '\n')
        switched = False
        application_ready = False
        build_environment = {key: environment[key] for key in ('CONTENT_SOURCE', 'CONTENT_BUILD_TOKEN') if key in environment}
        previous_environment = {key: os.environ.get(key) for key in ('CONTENT_SOURCE', 'CONTENT_BUILD_TOKEN')}
        os.environ['CONTENT_SOURCE'] = 'files'
        os.environ.pop('CONTENT_BUILD_TOKEN', None)
        os.environ.update(build_environment)
        blocked = self.base / 'evidence/deployment-blocked'
        write_private(blocked, f'Deployment incomplete; inspect {backup}\n')
        try:
            self.restore_generated_cache()
            git(self.repo, 'checkout', '--detach', commit)
            switched = True
            self.install_dependencies()
            write_private(self.base / 'publish-library.py', (self.repo / 'deploy/server/publish-library.py').read_text())
            self.up(image)
            application_ready = True
            self.publish()
            self.restore_generated_cache()
            record['site'] = os.readlink(current)
            write_private(self.base / 'evidence/deployment.json', json.dumps(record, indent=2) + '\n')
            blocked.unlink()
            print('Deployed commit:', commit, 'static release:', record['site'])
        except Exception:
            if switched:
                try:
                    check_release_compatibility(database, previous)
                except Exception as compatibility_error:
                    # Do not restore an old image, checkout or publisher after
                    # Draft or Trash data exists: a legacy read boundary can
                    # expose unpublished or deleted content. Keep a healthy candidate; when
                    # startup did not finish, stop the possibly legacy service.
                    errors = [str(compatibility_error)]
                    if not application_ready:
                        try:
                            self.stop()
                        except Exception as error:
                            errors.append(f'Could not stop unverified application: {error}')
                    try:
                        set_current(self.base, old_site)
                    except Exception as error:
                        errors.append(f'Could not restore previous static site: {error}')
                    errors.append(f'Retain database/schema and candidate source; inspect {backup}. '
                                  + ('Candidate application passed startup checks.' if application_ready else 'Application startup was not verified; keep writes paused.'))
                    write_private(blocked, '\n'.join(errors) + '\n')
                    raise RuntimeError('Unsafe legacy rollback blocked; data preserved; verify application and previous static release before resuming') from compatibility_error
                print('Deployment failed; restoring previous application and static release', file=sys.stderr)
                # Restore the application before releasing the content publication lock.
                # Never restore SQLite/media automatically: preserve writes made during this attempt.
                errors = []
                for action in (lambda: self.up(old_image), self.restore_generated_cache,
                               lambda: git(self.repo, 'checkout', '--detach', previous_commit),
                               self.install_dependencies,
                               lambda: set_current(self.base, old_site)):
                    try:
                        action()
                    except Exception as error:
                        errors.append(str(error))
                for name, value in saved.items():
                    path = self.base / name
                    if value is None:
                        path.unlink(missing_ok=True)
                    else:
                        write_private(path, value.decode())
                if errors:
                    # Prevent the timer from publishing a partially restored checkout.
                    write_private(self.base / 'evidence/deployment-blocked', '\n'.join(errors) + '\n')
                    raise RuntimeError('Rollback needs operator attention; content publishing has been blocked')
            blocked.unlink(missing_ok=True)
            raise
        finally:
            for key, value in previous_environment.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value


def main(base, commit, image):
    validate_release(commit, image)
    os.umask(0o077)
    evidence = base / 'evidence'
    evidence.mkdir(exist_ok=True)
    if (evidence / 'deployment-blocked').exists():
        raise ValueError('Resolve the recorded failed rollback before deploying again')
    with (evidence / 'library-publication.lock').open('a') as lock:
        # Wait for a current content build; do not stop it in the middle.
        deadline = time.monotonic() + 300
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise RuntimeError('Content publisher is busy; retry deployment later')
                time.sleep(5)
        if (evidence / 'deployment-blocked').exists():
            raise ValueError('Resolve the recorded incomplete deployment before deploying again')
        Deployment(base).execute(commit, image)


if __name__ == '__main__':
    def interrupted(signum, frame):
        # Give normal SSH cancellation a chance to run the rollback path.
        raise RuntimeError(f'Deployment interrupted by signal {signum}')

    for number in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(number, interrupted)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('commit')
    parser.add_argument('image')
    args = parser.parse_args()
    try:
        main(BASE, args.commit, args.image)
    except Exception as error:
        sys.exit(f'Deployment stopped: {error}')
