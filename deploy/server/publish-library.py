#!/usr/bin/env python3
"""Publish changed public Works using the existing production Astro build."""
import datetime
import argparse
import fcntl
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = Path(__file__).resolve().parent
REPO = BASE.parent / 'homepage'
STATE = BASE / 'evidence/library-publication.json'
QUIET_SECONDS = 180
FAILURE_RETRY_SECONDS = 300


def write_json(file, value):
    temp = file.with_suffix('.tmp')
    temp.write_text(json.dumps(value, indent=2) + '\n')
    os.replace(temp, file)


def wait_for_quiet(pending_file, digest, published_digest, now):
    if digest == published_digest:
        pending_file.unlink(missing_ok=True)
        print('Public Works unchanged; current site retained')
        return True
    pending = json.loads(pending_file.read_text()) if pending_file.exists() else {}
    changed_at = pending.get('last_change_epoch', now)
    if pending.get('digest') != digest or now < changed_at:
        write_json(pending_file, {'digest': digest, 'last_change_epoch': now})
        print('Public Works changed; waiting for 3 quiet minutes before building')
        return True
    remaining = max(changed_at + QUIET_SECONDS, pending.get('retry_after_epoch', 0)) - now
    if remaining > 0:
        print('Publication deferred; seconds remaining:', round(remaining))
        return True
    return False


def read_works():
    docs = []
    for page in range(1, 1001):
        query = urllib.parse.urlencode({
            'draft': 'false', 'depth': 1, 'limit': 100, 'page': page, 'sort': 'slug',
            'where[visibility][equals]': 'public', 'where[_status][equals]': 'published',
        })
        with urllib.request.urlopen('http://127.0.0.1:3000/api/works?' + query, timeout=20) as response:
            data = json.load(response)
        if not isinstance(data.get('docs'), list) or not isinstance(data.get('hasNextPage'), bool):
            raise ValueError('Unexpected Works API response; keeping existing site')
        for doc in data['docs']:
            if doc.get('visibility') != 'public' or doc.get('_status') != 'published' or doc.get('deletedAt'):
                raise ValueError('Unexpected nonpublic API document; keeping existing site')
            docs.append(doc)
        if not data['hasNextPage']:
            break
        if not data['docs']:
            raise ValueError('Unexpected empty API page')
    else:
        raise ValueError('Works API exceeded pagination limit')
    return docs, hashlib.sha256(json.dumps(docs, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def read_cover_pool():
    """Read selected public cover settings; only legacy missing routes fall back."""
    try:
        with urllib.request.urlopen('http://127.0.0.1:3000/api/site-covers', timeout=20) as response:
            pool = json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise
    if not isinstance(pool, dict) or type(pool.get('version')) is not int or pool['version'] != 1:
        raise ValueError('Invalid cover settings; keeping existing site')
    covers = pool.get('covers')
    if (not isinstance(covers, list) or not 0 <= len(covers) <= 250
            or any(not isinstance(url, str) or len(url) > 4096 for url in covers)):
        raise ValueError('Invalid cover list; keeping existing site')
    for url in covers:
        if url in {'/img/cover/' + str(n) + '.webp' for n in range(1, 22)}:
            continue
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError('Unsafe cover URL; keeping existing site')
    return pool


def read_content():
    works, digest = read_works()
    posts = []
    if os.environ.get('CONTENT_SOURCE', 'files') == 'payload':
        token = os.environ.get('CONTENT_BUILD_TOKEN', '')
        if len(token) < 32:
            raise ValueError('Private CONTENT_BUILD_TOKEN is required for article publishing')
        for page in range(1, 1001):
            request = urllib.request.Request(
                f'http://127.0.0.1:3000/api/content/posts?page={page}',
                headers={'Authorization': 'Bearer ' + token})
            with urllib.request.urlopen(request, timeout=20) as response:
                data = json.load(response)
            if not isinstance(data.get('docs'), list) or not isinstance(data.get('hasNextPage'), bool):
                raise ValueError('Invalid article snapshot; keeping existing site')
            for post in data['docs']:
                if post.get('_status') != 'published' or post.get('deletedAt'):
                    raise ValueError('Unpublished article in build snapshot')
                posts.append(post)
            if not data['hasNextPage']:
                break
            if not data['docs']:
                raise ValueError('Empty article page claims more results')
        else:
            raise ValueError('Article pagination limit exceeded')
        digest = hashlib.sha256(json.dumps({'works': works, 'posts': posts}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    cover_pool = read_cover_pool() if os.environ.get('CONTENT_SOURCE', 'files') == 'payload' else None
    if cover_pool is not None:
        digest = hashlib.sha256(json.dumps({'works': works, 'posts': posts, 'coverPool': cover_pool},
                                          sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return works, posts, digest, cover_pool


class Cards(HTMLParser):
    def __init__(self):
        super().__init__()
        self.slugs = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'article' and 'data-work-slug' in attrs:
            self.slugs.add(attrs['data-work-slug'])


def expected_slugs(docs):
    # Share the frontend's actual ordering instead of duplicating date rules here.
    code = """
import fs from 'node:fs';
import { publicLibraryWork } from './src/lib/library/data.ts';
import { sortLibraryWorks } from './src/lib/library/view.ts';
const docs = JSON.parse(fs.readFileSync(0, 'utf8'));
const works = docs.map(doc => publicLibraryWork(doc, 'https://traceonsnow.com')).filter(Boolean);
process.stdout.write(JSON.stringify(sortLibraryWorks(works).slice(0, 24).map(work => work.slug)));
"""
    result = subprocess.run(
        ['/usr/bin/node', '--import', 'tsx', '--input-type=module', '-e', code],
        cwd=REPO, input=json.dumps(docs), text=True, capture_output=True, check=True,
    )
    return set(json.loads(result.stdout))


def run_build(*, env, output):
    process = subprocess.Popen([
        '/usr/bin/npm', 'exec', '--offline', '--yes', '--package=pnpm@10.28.2',
        '--', 'pnpm', 'build',
    ], cwd=REPO, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        code = process.wait(timeout=600)
    except BaseException:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
        raise
    if code:
        raise subprocess.CalledProcessError(code, 'Astro production build')


def publish(refresh=False):
    """Publish while the caller holds library-publication.lock; return whether it switched."""
    evidence = BASE / 'evidence'
    docs, posts, digest, cover_pool = read_content()
    pending_file = evidence / 'library-pending.json'
    published_digest = json.loads(STATE.read_text()).get('digest') if STATE.exists() else None
    if refresh and digest == published_digest:
        # Explicit code-only deployment; unchanged data requires no new wait.
        write_json(pending_file, {'digest': digest, 'last_change_epoch': time.time()})
    else:
        if wait_for_quiet(pending_file, digest, published_digest, time.time()):
            return False
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    log = evidence / ('library-build-' + stamp + '.log')
    build_env = os.environ.copy()
    build_env['PAYLOAD_URL'] = 'http://127.0.0.1:3000'
    snapshot = evidence / ('content-build-' + stamp + '.json')
    with snapshot.open('x') as output:
        content = {'works': docs, 'posts': posts}
        if cover_pool is not None:
            content['coverPool'] = cover_pool
        json.dump(content, output)
    build_env['CONTENT_BUILD_SNAPSHOT'] = str(snapshot)
    print('Building updated Library; log:', log, flush=True)
    # A failed build or worker restart must not trigger a build every minute.
    pending = json.loads(pending_file.read_text())
    pending['retry_after_epoch'] = time.time() + FAILURE_RETRY_SECONDS
    write_json(pending_file, pending)
    try:
        with log.open('x') as output:
            run_build(env=build_env, output=output)
    except Exception:
        pending['retry_after_epoch'] = time.time() + FAILURE_RETRY_SECONDS
        write_json(pending_file, pending)
        raise
    finally:
        snapshot.unlink(missing_ok=True)
    _, _, after, _ = read_content()
    if after != digest:
        write_json(pending_file, {'digest': after, 'last_change_epoch': time.time()})
        print('Works changed during build; retaining current site and restarting quiet period')
        return False
    cards = Cards()
    cards.feed((REPO / 'dist/library/index.html').read_text())
    if cards.slugs != expected_slugs(docs):
        raise ValueError('Built Library does not match public API; retaining current site')
    if not (REPO / 'dist/pagefind/pagefind.js').is_file():
        raise ValueError('Search index missing; retaining current site')
    release = BASE / 'public/releases' / stamp
    # Public static files must be readable by the existing Nginx worker.
    shutil.copytree(REPO / 'dist', release)
    release.chmod(0o755)
    for item in release.rglob('*'):
        item.chmod(0o755 if item.is_dir() else 0o644)
    current = BASE / 'public/current'
    if not current.is_symlink():
        raise ValueError('Current site is not the expected deployment symlink')
    previous = os.readlink(current)
    staged = BASE / 'public' / ('.current-' + stamp)
    staged.symlink_to('releases/' + stamp)
    os.replace(staged, current)
    record = {
        'digest': digest, 'published_at_utc': stamp, 'public_works': len(docs),
        'release': str(release), 'previous': previous, 'build_log': str(log),
    }
    write_json(STATE, record)
    pending_file.unlink(missing_ok=True)
    print('Published public Works:', len(docs), 'release:', stamp)
    return True


def main(refresh=False):
    os.umask(0o077)
    evidence = BASE / 'evidence'
    evidence.mkdir(exist_ok=True)
    with (evidence / 'library-publication.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return False
        if (evidence / 'deployment-blocked').exists():
            raise ValueError('Resolve the failed deployment before publishing content')
        return publish(refresh=refresh)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Rebuild unchanged published data after a code change')
    args = parser.parse_args()
    try:
        main(refresh=args.refresh)
    except Exception as error:
        print('Publication stopped; existing site retained:', error, file=sys.stderr)
        sys.exit(1)
