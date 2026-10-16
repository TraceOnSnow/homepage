#!/usr/bin/env python3
"""Exercise publication with temporary files, fake time and no network/builds."""
import importlib.util
import fcntl
import json
import io
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('publisher', Path(__file__).with_name('publish-library.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='homepage-debounce-check-')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.repo = self.base / 'repo'
        (self.base / 'evidence').mkdir()
        (self.base / 'public/releases/old').mkdir(parents=True)
        (self.base / 'public/current').symlink_to('releases/old')
        (self.repo / 'dist/library').mkdir(parents=True)
        (self.repo / 'dist/library/index.html').write_text('<article data-work-slug="game"></article>')
        (self.repo / 'dist/pagefind').mkdir()
        (self.repo / 'dist/pagefind/pagefind.js').write_text('// synthetic fixture')
        self.state = self.base / 'evidence/library-publication.json'
        self.pending = self.base / 'evidence/library-pending.json'
        self.state.write_text(json.dumps({'digest': 'published'}))
        self.docs = [{'slug': 'game', 'visibility': 'public'}]
        self.patches = [patch.object(publisher, 'BASE', self.base),
                        patch.object(publisher, 'REPO', self.repo),
                        patch.object(publisher, 'STATE', self.state),
                        patch.object(publisher, 'expected_slugs', return_value={'game'})]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def tick(self, seconds, digest, build, after=None):
        responses = [(self.docs, [], digest), (self.docs, [], after or digest)]
        with patch.object(publisher.time, 'time', return_value=10000 + seconds), \
             patch.object(publisher, 'read_content', side_effect=responses), \
             patch.object(publisher, 'run_build', build):
            publisher.main()

    def test_each_minute_edit_postpones_and_publishes_only_once(self):
        with patch.object(publisher, 'run_build') as build:
            for minute in range(6):
                self.tick(minute * 60, 'edit-' + str(minute), build)
            self.tick(360, 'edit-5', build)
            self.tick(479, 'edit-5', build)
            build.assert_not_called()
            self.assertEqual(os.readlink(self.base / 'public/current'), 'releases/old')
            self.tick(480, 'edit-5', build)
            self.assertEqual(build.call_count, 1)
            self.assertEqual(json.loads(self.state.read_text())['digest'], 'edit-5')
            self.assertFalse(self.pending.exists())
            self.tick(540, 'edit-5', build)
            self.assertEqual(build.call_count, 1)

    def test_edit_during_build_restarts_full_quiet_period(self):
        with patch.object(publisher, 'run_build') as build:
            self.tick(0, 'edit-a', build)
            self.tick(180, 'edit-a', build, after='edit-b')
            self.assertEqual(os.readlink(self.base / 'public/current'), 'releases/old')
            self.assertEqual(json.loads(self.pending.read_text())['digest'], 'edit-b')
            self.tick(240, 'edit-b', build)
            self.tick(359, 'edit-b', build)
            self.assertEqual(build.call_count, 1)

    def test_failed_build_keeps_site_and_backs_off(self):
        with patch.object(publisher, 'run_build', side_effect=subprocess.CalledProcessError(1, 'synthetic-build')) as build:
            self.tick(0, 'edit-a', build)
            with self.assertRaises(subprocess.CalledProcessError):
                self.tick(180, 'edit-a', build)
            self.tick(240, 'edit-a', build)
            self.assertEqual(build.call_count, 1)
            self.assertEqual(os.readlink(self.base / 'public/current'), 'releases/old')
            self.assertEqual(json.loads(self.state.read_text())['digest'], 'published')

    def test_revert_to_published_content_cancels_pending_build(self):
        with patch.object(publisher, 'run_build') as build:
            self.tick(0, 'temporary-edit', build)
            self.assertTrue(self.pending.exists())
            self.tick(60, 'published', build)
            self.assertFalse(self.pending.exists())
            build.assert_not_called()

    def test_valid_empty_works_is_distinct_from_a_failed_api(self):
        with patch.object(publisher.urllib.request, 'urlopen', return_value=io.BytesIO(b'{"docs":[],"hasNextPage":false}')):
            self.assertEqual(publisher.read_works()[0], [])
        with patch.object(publisher.urllib.request, 'urlopen', return_value=io.BytesIO(b'{"error":"unavailable"}')):
            with self.assertRaises(ValueError):
                publisher.read_works()

    def test_last_work_removal_publishes_an_empty_library(self):
        self.docs = []
        (self.repo / 'dist/library/index.html').write_text('<p>Empty library</p>')
        with patch.object(publisher, 'expected_slugs', return_value=set()), \
             patch.object(publisher, 'run_build') as build:
            self.tick(0, 'empty-library', build)
            self.tick(180, 'empty-library', build)
            self.assertEqual(json.loads(self.state.read_text())['public_works'], 0)
            self.assertEqual(build.call_count, 1)

    def test_unlinked_article_edits_join_the_same_digest(self):
        with patch.dict(os.environ, {'CONTENT_SOURCE': 'payload', 'CONTENT_BUILD_TOKEN': 'test-build-token-at-least-32-characters'}), \
             patch.object(publisher, 'read_works', return_value=(self.docs, 'same-works')):
            def read(markdown):
                body = json.dumps({'docs': [{'id': 1, '_status': 'published', 'markdown': markdown}], 'hasNextPage': False}).encode()
                with patch.object(publisher.urllib.request, 'urlopen', return_value=io.BytesIO(body)):
                    return publisher.read_content()[2]
            self.assertNotEqual(read('original'), read('edited'))
            self.assertNotEqual(read('original'), read(''))

    def test_failure_retry_starts_when_a_long_build_finishes(self):
        now = [10000.0]
        with patch.object(publisher.time, 'time', side_effect=lambda: now[0]), \
             patch.object(publisher, 'read_content', return_value=(self.docs, [], 'changed')):
            publisher.main()
            now[0] += 180
            def fail(*args, **kwargs):
                now[0] += 600
                raise subprocess.CalledProcessError(1, 'synthetic')
            with patch.object(publisher, 'run_build', side_effect=fail):
                with self.assertRaises(subprocess.CalledProcessError):
                    publisher.main()
            self.assertEqual(json.loads(self.pending.read_text())['retry_after_epoch'], now[0] + 300)
            self.assertFalse(list((self.base / 'evidence').glob('content-build-*.json')))

    def test_code_refresh_publishes_unchanged_content_without_a_new_quiet_period(self):
        with patch.object(publisher, 'read_content', return_value=(self.docs, [], 'published')), \
             patch.object(publisher, 'run_build') as build:
            self.assertTrue(publisher.main(refresh=True))
            self.assertEqual(build.call_count, 1)
            self.assertNotEqual(os.readlink(self.base / 'public/current'), 'releases/old')

    def test_deployment_and_content_timer_share_one_lock(self):
        with (self.base / 'evidence/library-publication.lock').open('a') as lock, \
             patch.object(publisher, 'read_content') as read:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertFalse(publisher.main(refresh=True))
            read.assert_not_called()

    def test_incomplete_deployment_stops_content_publication(self):
        (self.base / 'evidence/deployment-blocked').write_text('review required')
        with patch.object(publisher, 'read_content') as read:
            with self.assertRaisesRegex(ValueError, 'failed deployment'):
                publisher.main(refresh=True)
            read.assert_not_called()


if __name__ == '__main__':
    unittest.main()
