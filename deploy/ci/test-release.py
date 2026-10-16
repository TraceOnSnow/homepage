#!/usr/bin/env python3
"""Check CI provenance and reject untrusted or ambiguous deployment inputs."""
import copy
import importlib.util
from pathlib import Path
import unittest


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


root = Path(__file__).resolve().parent
verifier = load('verifier', root / 'verify-release.py')
ssh = load('ssh_deploy', root.parent / 'server/ssh-deploy.py')


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.repository = 'TraceOnSnow/homepage'
        self.run = {'id': 123, 'run_attempt': 2, 'workflow_id': 456, 'status': 'completed',
                    'conclusion': 'success', 'head_branch': 'main', 'event': 'push',
                    'head_sha': 'a' * 40, 'repository': {'full_name': self.repository}}
        self.workflow = {'id': 456, 'path': '.github/workflows/ci.yml'}
        self.manifest = {'commit': 'a' * 40, 'run_id': 123, 'run_attempt': 2,
                         'platform': 'linux/amd64',
                         'image': 'ghcr.io/traceonsnow/homepage-payload@sha256:' + 'b' * 64}

    def test_successful_run_selects_its_exact_attempt(self):
        self.assertEqual(verifier.verify_run(self.run, self.workflow, self.repository), 'release-' + 'a' * 40 + '-2')
        self.assertEqual(verifier.verify_manifest(self.manifest, self.run, self.repository)['commit'], 'a' * 40)

    def test_failed_running_pr_branch_or_different_workflow_is_rejected(self):
        for key, value in [('conclusion', 'failure'), ('status', 'in_progress'),
                           ('event', 'pull_request'), ('head_branch', 'feature'),
                           ('workflow_id', 789), ('head_sha', 'main;touch /tmp/injected'),
                           ('repository', {'full_name': 'attacker/homepage'})]:
            with self.subTest(key=key):
                run = {**self.run, key: value}
                with self.assertRaises(ValueError):
                    verifier.verify_run(run, self.workflow, self.repository)

    def test_manifest_from_other_run_attempt_commit_or_registry_is_rejected(self):
        for key, value in [('run_id', 124), ('run_attempt', 1), ('commit', 'c' * 40),
                           ('platform', 'linux/arm64'), ('image', 'ghcr.io/traceonsnow/homepage-payload:latest'),
                           ('image', 'ghcr.io/attacker/homepage-payload@sha256:' + 'b' * 64),
                           ('image', self.manifest['image'] + '\nimage=bad')]:
            with self.subTest(key=key, value=value):
                manifest = copy.deepcopy(self.manifest)
                manifest[key] = value
                with self.assertRaises(ValueError):
                    verifier.verify_manifest(manifest, self.run, self.repository)

    def test_forced_ssh_command_accepts_only_the_pinned_release(self):
        command = 'deploy ' + self.manifest['commit'] + ' ' + self.manifest['image']
        self.assertEqual(ssh.parse_command(command), [self.manifest['commit'], self.manifest['image']])
        for command in ['', 'bash', 'deploy main image:latest', command + '; id',
                        command + ' extra', 'deploy ' + 'a' * 40 + ' $(id)']:
            with self.subTest(command=command):
                with self.assertRaises(ValueError):
                    ssh.parse_command(command)


if __name__ == '__main__':
    unittest.main()
