#!/usr/bin/env python3
"""Exercise real temporary Git/SQLite releases; mock Docker and the website build."""
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deployer', Path(__file__).with_name('deploy-release.py'))
deployer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployer)
IMAGE = 'ghcr.io/traceonsnow/homepage-payload@sha256:' + 'b' * 64


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='homepage-release-test-')
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.repo = root / 'homepage'
        self.base = root / 'homepage-deployment'
        self.repo.mkdir()
        self.base.mkdir()
        for directory in ('evidence', 'data/database', 'data/media', 'public/releases/old'):
            (self.base / directory).mkdir(parents=True)
        (self.base / 'public/current').symlink_to('releases/old')
        (self.base / 'runtime.env').write_text('PAYLOAD_SECRET=disposable-test-value\n')
        (self.base / 'compose.yaml').write_text('services: {}\n')
        (self.base / 'publish-library.py').write_text('# previous publisher\n')
        (self.base / 'evidence/library-publication.json').write_text('{"digest":"previous"}\n')
        self.database = self.base / 'data/database/payload.db'
        with sqlite3.connect(self.database) as db:
            db.execute('CREATE TABLE payload_migrations (id INTEGER PRIMARY KEY, name TEXT)')
            db.execute("INSERT INTO payload_migrations(name) VALUES ('001_initial')")
            db.execute('CREATE TABLE works (note TEXT)')
            db.execute("INSERT INTO works VALUES ('Preserve my reaction')")
        self.original_db = self.database.read_bytes()
        self.git('init', '--quiet')
        self.git('config', 'user.name', 'Deployment test')
        self.git('config', 'user.email', 'deployment@example.test')
        directory = self.repo / deployer.MIGRATIONS
        directory.mkdir(parents=True)
        (directory / '001_initial.ts').write_text('// Preserve existing schema\n')
        (directory / 'index.ts').write_text("import * as initial from './001_initial';\nexport const migrations = [{name: '001_initial'}];\n")
        (self.repo / '.cache').mkdir()
        (self.repo / '.cache/og-data.json').write_text('{}\n')
        (self.repo / 'deploy/server').mkdir(parents=True)
        (self.repo / 'deploy/server/publish-library.py').write_text('# old source\n')
        self.git('add', '.')
        self.git('commit', '--quiet', '-m', 'initial')
        self.previous = self.git('rev-parse', 'HEAD')
        source = Path(__file__).with_name('publish-library.py').read_text()
        (self.repo / 'deploy/server/publish-library.py').write_text(source)
        (self.repo / '.cache/og-data.json').write_text('{"version":2}\n')
        self.git('add', '.')
        self.git('commit', '--quiet', '-m', 'new release')
        self.target = self.git('rev-parse', 'HEAD')
        self.git('update-ref', 'refs/remotes/origin/main', self.target)
        self.git('checkout', '--quiet', '--detach', self.previous)
        self.deployment = deployer.Deployment(self.base)
        self.commands = []
        self.fail_up = False
        self.real_run = deployer.run
        fake = patch.object(deployer, 'run', side_effect=self.command)
        fake.start()
        self.addCleanup(fake.stop)

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.repo, text=True, stderr=subprocess.DEVNULL).strip()

    def command(self, args, cwd, **kwargs):
        self.commands.append(args)
        if args[:3] == ['git', 'fetch', 'origin']:
            return ''
        if args[0] == '/usr/bin/npm':
            return ''
        if args[0] != 'docker':
            return self.real_run(args, cwd, **kwargs)
        mounts = [{'type': 'bind', 'target': '/app/storage/' + name,
                   'source': str(self.base / 'data' / name)} for name in ('database', 'media')]
        if 'config' in args:
            return json.dumps({'services': {'payload': {'volumes': mounts, 'environment': {
                'DATABASE_URL': 'file:/app/storage/database/payload.db',
                'MEDIA_DIR': '/app/storage/media', 'CONTENT_SOURCE': 'files'}}}})
        if 'ps' in args:
            return 'old-container'
        if args[1] == 'inspect':
            return json.dumps([{'Image': 'sha256:' + 'a' * 64, 'Mounts': [
                {'Destination': item['target'], 'Source': item['source']} for item in mounts]}])
        if args[1:3] == ['image', 'inspect']:
            return json.dumps([{'Architecture': 'amd64', 'Os': 'linux', 'Config': {'Labels': {
                'org.opencontainers.image.revision': self.target,
                'org.opencontainers.image.source': 'https://github.com/TraceOnSnow/homepage'}}}])
        if args[1] == 'version':
            return 'amd64'
        if 'up' in args and self.fail_up:
            self.fail_up = False
            raise RuntimeError('Synthetic container health failure')
        return ''

    def publish(self):
        (self.repo / '.cache/og-data.json').write_text('{"generated":true}\n')
        (self.base / 'public/releases/new').mkdir(exist_ok=True)
        deployer.set_current(self.base, 'releases/new')
        (self.base / 'evidence/library-publication.json').write_text('{"digest":"new"}')
        return True

    def migrated_works(self):
        """A real temporary Git upgrade and database with native draft semantics."""
        self.git('checkout', '--quiet', '--detach', self.target)
        directory = self.repo / deployer.MIGRATIONS
        migration = deployer.WORKS_DRAFT_MIGRATION
        (directory / f'{migration}.ts').write_text('// Reviewed native Works drafts migration\n')
        (directory / 'index.ts').write_text(
            "import * as initial from './001_initial';\n"
            f"import * as drafts from './{migration}';\n"
            f"export const migrations = [{{name: '001_initial'}}, {{name: '{migration}'}}];\n")
        self.git('add', '.')
        self.git('commit', '--quiet', '-m', 'native Works drafts')
        self.target = self.git('rev-parse', 'HEAD')
        self.git('update-ref', 'refs/remotes/origin/main', self.target)
        self.git('checkout', '--quiet', '--detach', self.previous)
        with sqlite3.connect(self.database) as db:
            db.execute('ALTER TABLE works ADD COLUMN _status TEXT')
            db.execute("UPDATE works SET _status = 'published'")
            db.execute('CREATE TABLE _works_v (id INTEGER PRIMARY KEY)')
            db.execute('INSERT INTO payload_migrations(name) VALUES (?)', (migration,))

    def test_explicit_legacy_release_is_rejected_after_works_draft_migration(self):
        self.migrated_works()
        with self.assertRaisesRegex(ValueError, 'draft privacy'):
            self.deployment.execute(self.previous, IMAGE)
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.previous)
        self.assertFalse(any('pull' in command or 'up' in command for command in self.commands))

    def test_physical_draft_schema_blocks_legacy_even_without_migration_bookkeeping(self):
        self.migrated_works()
        with sqlite3.connect(self.database) as db:
            db.execute('DELETE FROM payload_migrations WHERE name = ?', (deployer.WORKS_DRAFT_MIGRATION,))
        with self.assertRaisesRegex(ValueError, 'draft privacy'):
            deployer.check_release_compatibility(self.database, {'001_initial': 'source'})

    def test_failed_upgrade_keeps_compatible_app_and_blocks_legacy_rollback(self):
        self.migrated_works()
        def fail():
            self.publish()
            with sqlite3.connect(self.database) as db:
                db.execute("INSERT INTO works VALUES ('New unpublished private reaction', 'draft')")
            raise RuntimeError('Synthetic build failure after draft edit')
        with patch.object(self.deployment, 'publish', side_effect=fail):
            with self.assertRaisesRegex(RuntimeError, 'Unsafe legacy rollback blocked'):
                self.deployment.execute(self.target, IMAGE)
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.target)
        self.assertEqual(os.readlink(self.base / 'public/current'), 'releases/old')
        self.assertEqual(json.loads((self.base / 'compose.release.yaml').read_text())['services']['payload']['image'], IMAGE)
        self.assertEqual((self.base / 'publish-library.py').read_text(), (self.repo / 'deploy/server/publish-library.py').read_text())
        self.assertEqual(sum('up' in command for command in self.commands), 1)
        self.assertFalse(any('stop' in command for command in self.commands))
        self.assertIn('draft privacy', (self.base / 'evidence/deployment-blocked').read_text())
        with sqlite3.connect(self.database) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM works WHERE _status='draft'").fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM _works_v').fetchone()[0], 0)
        with self.assertRaisesRegex(ValueError, 'failed rollback'):
            deployer.main(self.base, self.target, IMAGE)

    def test_failed_upgrade_startup_stops_unverified_service_instead_of_legacy_restart(self):
        self.migrated_works()
        self.fail_up = True
        with self.assertRaisesRegex(RuntimeError, 'Unsafe legacy rollback blocked'):
            self.deployment.execute(self.target, IMAGE)
        self.assertTrue(any('stop' in command and 'payload' in command for command in self.commands))
        self.assertEqual(sum('up' in command for command in self.commands), 1)
        self.assertTrue((self.base / 'evidence/deployment-blocked').exists())
        self.assertEqual(os.readlink(self.base / 'public/current'), 'releases/old')

    def test_failed_upgrade_before_app_switch_stops_possibly_legacy_service(self):
        self.migrated_works()
        with patch.object(self.deployment, 'install_dependencies', side_effect=RuntimeError('Synthetic dependency failure')):
            with self.assertRaisesRegex(RuntimeError, 'Unsafe legacy rollback blocked'):
                self.deployment.execute(self.target, IMAGE)
        self.assertTrue(any('stop' in command and 'payload' in command for command in self.commands))
        self.assertFalse(any('up' in command for command in self.commands))
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.target)
        self.assertTrue((self.base / 'evidence/deployment-blocked').exists())
        self.assertEqual(os.readlink(self.base / 'public/current'), 'releases/old')

    def test_draft_compatible_previous_release_can_roll_back_without_restoring_database(self):
        self.migrated_works()
        self.previous = self.target
        self.git('checkout', '--quiet', '--detach', self.previous)
        (self.repo / 'release.txt').write_text('Next draft-compatible release\n')
        self.git('add', '.')
        self.git('commit', '--quiet', '-m', 'next compatible release')
        self.target = self.git('rev-parse', 'HEAD')
        self.git('update-ref', 'refs/remotes/origin/main', self.target)
        self.git('checkout', '--quiet', '--detach', self.previous)
        with patch.object(self.deployment, 'publish', side_effect=RuntimeError('Synthetic build failure')):
            with self.assertRaisesRegex(RuntimeError, 'Synthetic build failure'):
                self.deployment.execute(self.target, IMAGE)
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.previous)
        self.assertFalse((self.base / 'evidence/deployment-blocked').exists())
        self.assertEqual(os.readlink(self.base / 'public/current'), 'releases/old')

    def test_success_uses_exact_image_and_records_previous_release(self):
        (self.repo / '.cache/og-data.json').write_text('{"generated-before-deploy":true}')
        with patch.object(self.deployment, 'publish', side_effect=self.publish):
            self.deployment.execute(self.target, IMAGE)
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.target)
        self.assertEqual(self.git('status', '--porcelain'), '')
        self.assertEqual(os.readlink(self.base / 'public/current'), 'releases/new')
        record = json.loads((self.base / 'evidence/deployment.json').read_text())
        self.assertEqual(record['previous_commit'], self.previous)
        self.assertEqual(record['image'], IMAGE)
        self.assertFalse((self.base / 'evidence/deployment-blocked').exists())
        self.assertEqual(self.database.read_bytes(), self.original_db)
        self.assertFalse(any('migrate' in command for command in self.commands))

    def test_build_failure_restores_checkout_site_publisher_and_application(self):
        def fail():
            self.publish()
            # Writes made during the failed release must survive application rollback.
            with sqlite3.connect(self.database) as db:
                db.execute("INSERT INTO works VALUES ('New authored note')")
            raise RuntimeError('Synthetic build failure')
        with patch.object(self.deployment, 'publish', side_effect=fail):
            with self.assertRaisesRegex(RuntimeError, 'Synthetic build failure'):
                self.deployment.execute(self.target, IMAGE)
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.previous)
        self.assertEqual(self.git('status', '--porcelain'), '')
        self.assertEqual(os.readlink(self.base / 'public/current'), 'releases/old')
        self.assertEqual((self.base / 'publish-library.py').read_text(), '# previous publisher\n')
        self.assertFalse((self.base / 'compose.release.yaml').exists())
        self.assertEqual(json.loads((self.base / 'evidence/library-publication.json').read_text()), {'digest': 'previous'})
        with sqlite3.connect(self.database) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM works').fetchone()[0], 2)
        self.assertFalse((self.base / 'evidence/deployment-blocked').exists())

    def test_unhealthy_container_rolls_back_before_publishing(self):
        self.fail_up = True
        with patch.object(self.deployment, 'publish') as publish:
            with self.assertRaisesRegex(RuntimeError, 'health failure'):
                self.deployment.execute(self.target, IMAGE)
            publish.assert_not_called()
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.previous)
        self.assertEqual(os.readlink(self.base / 'public/current'), 'releases/old')

    def test_pending_migration_stops_before_pull_checkout_or_restart(self):
        with sqlite3.connect(self.database) as db:
            db.execute('DELETE FROM payload_migrations')
        with self.assertRaisesRegex(ValueError, 'manual migration'):
            self.deployment.execute(self.target, IMAGE)
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.previous)
        self.assertFalse(any('pull' in command or 'up' in command for command in self.commands))

    def test_missing_database_is_not_recreated(self):
        self.database.unlink()
        with self.assertRaisesRegex(ValueError, 'Existing database'):
            self.deployment.execute(self.target, IMAGE)
        self.assertFalse(self.database.exists())

    def test_changed_migration_history_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'changed or removed'):
            deployer.check_migrations(self.database, {'001_initial': 'changed'}, {'001_initial': 'original'})

    def test_local_authored_edits_are_preserved(self):
        (self.repo / 'personal-note.md').write_text('Do not remove')
        with self.assertRaisesRegex(ValueError, 'local edits'):
            self.deployment.execute(self.target, IMAGE)
        self.assertEqual((self.repo / 'personal-note.md').read_text(), 'Do not remove')

    def test_incomplete_rollback_blocks_further_deployments(self):
        (self.base / 'evidence/deployment-blocked').write_text('operator review needed')
        with self.assertRaisesRegex(ValueError, 'failed rollback'):
            deployer.main(self.base, self.target, IMAGE)

    def test_rollback_failure_retains_a_block_marker_and_previous_static_site(self):
        with patch.object(self.deployment, 'publish', side_effect=RuntimeError('build failed')), \
             patch.object(self.deployment, 'install_dependencies', side_effect=[None, RuntimeError('restore failed')]):
            with self.assertRaisesRegex(RuntimeError, 'operator attention'):
                self.deployment.execute(self.target, IMAGE)
        self.assertTrue((self.base / 'evidence/deployment-blocked').exists())
        self.assertEqual(os.readlink(self.base / 'public/current'), 'releases/old')
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.previous)

    def test_timed_out_command_cannot_leave_a_child_writing_after_rollback(self):
        marker = self.base / 'orphan-output'
        child = "import pathlib,time;time.sleep(0.5);pathlib.Path(" + repr(str(marker)) + ").write_text('bad')"
        code = 'import subprocess,sys,time;subprocess.Popen([sys.executable,"-c",sys.argv[1]]);time.sleep(30)'
        with self.assertRaises(subprocess.TimeoutExpired):
            self.real_run([sys.executable, '-c', code, child], self.base, capture=True, timeout=0.2)
        time.sleep(0.6)
        self.assertFalse(marker.exists())

    def test_wrong_image_revision_is_rejected_before_mutation(self):
        self.target = 'c' * 40  # Fake Docker image no longer matches the approved commit.
        commit = self.git('rev-parse', 'origin/main')
        with self.assertRaisesRegex(ValueError, 'source revision'):
            self.deployment.execute(commit, IMAGE)
        self.assertEqual(self.git('rev-parse', 'HEAD'), self.previous)
        self.assertFalse((self.base / 'compose.release.yaml').exists())


if __name__ == '__main__':
    unittest.main()
