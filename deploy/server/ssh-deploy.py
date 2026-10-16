#!/usr/bin/env python3
"""Forced SSH command: accept only a release commit and immutable homepage image."""
import importlib.util
import os
from pathlib import Path
import shlex
import subprocess
import sys

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


if __name__ == '__main__':
    try:
        args = parse_command(os.environ.get('SSH_ORIGINAL_COMMAND', ''))
        sys.exit(subprocess.call([sys.executable, str(base / 'deploy-release.py'), *args], cwd=base))
    except (OSError, ValueError) as error:
        sys.exit(f'SSH deployment refused: {error}')
