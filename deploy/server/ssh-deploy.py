#!/usr/bin/env python3
"""Forced SSH command: accept only a release commit and immutable homepage image."""
import importlib.util
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile

base = Path(__file__).resolve().parent


def parse_command(command):
    args = shlex.split(command)
    if len(args) != 3 or args[0] != 'deploy':
        raise ValueError('Only deploy <commit> <image-digest> is supported')
    spec = importlib.util.spec_from_file_location('deploy_release', base / 'deploy-release.py')
    release = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(release)
    release.validate_release(*args[1:])
    return args[1:]


def deploy(args, token):
    """Keep the Actions registry credential in a private, per-session Docker config."""
    if len(token) > 8192 or any(character.isspace() for character in token):
        raise ValueError('Invalid registry credential')
    environment = os.environ.copy()
    with tempfile.TemporaryDirectory(prefix='homepage-ghcr-') as directory:
        environment['DOCKER_CONFIG'] = directory
        if token:
            login = subprocess.run(
                ['docker', 'login', 'ghcr.io', '--username', 'TraceOnSnow', '--password-stdin'],
                input=token, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                env=environment, timeout=60,
            )
            if login.returncode:
                raise ValueError('Temporary GHCR authentication failed')
        return subprocess.call([sys.executable, str(base / 'deploy-release.py'), *args],
                               cwd=base, env=environment, stdin=subprocess.DEVNULL)


if __name__ == '__main__':
    try:
        args = parse_command(os.environ.get('SSH_ORIGINAL_COMMAND', ''))
        sys.exit(deploy(args, sys.stdin.read(8193).strip()))
    except (OSError, ValueError) as error:
        sys.exit(f'SSH deployment refused: {error}')
