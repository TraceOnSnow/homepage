#!/usr/bin/env python3
"""Exercise publication with temporary files, fake time and no network/builds."""
import importlib.util
import json
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
        responses = [(self.docs, digest), (self.docs, after or digest)]
        with patch.object(publisher.time, 'time', return_value=10000 + seconds), \
             patch.object(publisher, 'read_works', side_effect=responses), \
             patch.object(publisher.subprocess, 'run', build):
            publisher.main()

    def test_each_minute_edit_postpones_and_publishes_only_once(self):
        with patch.object(publisher.subprocess, 'run') as build:
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
        with patch.object(publisher.subprocess, 'run') as build:
            self.tick(0, 'edit-a', build)
            self.tick(180, 'edit-a', build, after='edit-b')
            self.assertEqual(os.readlink(self.base / 'public/current'), 'releases/old')
            self.assertEqual(json.loads(self.pending.read_text())['digest'], 'edit-b')
            self.tick(240, 'edit-b', build)
            self.tick(359, 'edit-b', build)
            self.assertEqual(build.call_count, 1)

    def test_failed_build_keeps_site_and_backs_off(self):
        with patch.object(publisher.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'synthetic-build')) as build:
            self.tick(0, 'edit-a', build)
            with self.assertRaises(subprocess.CalledProcessError):
                self.tick(180, 'edit-a', build)
            self.tick(240, 'edit-a', build)
            self.assertEqual(build.call_count, 1)
            self.assertEqual(os.readlink(self.base / 'public/current'), 'releases/old')
            self.assertEqual(json.loads(self.state.read_text())['digest'], 'published')

    def test_revert_to_published_content_cancels_pending_build(self):
        with patch.object(publisher.subprocess, 'run') as build:
            self.tick(0, 'temporary-edit', build)
            self.assertTrue(self.pending.exists())
            self.tick(60, 'published', build)
            self.assertFalse(self.pending.exists())
            build.assert_not_called()


if __name__ == '__main__':
    unittest.main()
