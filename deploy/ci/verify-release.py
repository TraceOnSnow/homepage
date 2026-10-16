#!/usr/bin/env python3
"""Accept only an artifact from a successful, trusted main-branch CI run."""
import json
import os
from pathlib import Path
import re
import sys


def verify_run(run, workflow, repository):
    if (run.get('status') != 'completed' or run.get('conclusion') != 'success'
            or run.get('head_branch') != 'main' or run.get('event') not in ('push', 'workflow_dispatch')
            or run.get('repository', {}).get('full_name') != repository
            or run.get('workflow_id') != workflow.get('id')
            or workflow.get('path') != '.github/workflows/ci.yml'):
        raise ValueError('Select a successful main-branch CI run from this repository')
    sha = run.get('head_sha', '')
    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise ValueError('Invalid CI commit')
    for key in ('id', 'run_attempt'):
        if type(run.get(key)) is not int or run[key] < 1:
            raise ValueError('Invalid CI run identity')
    return f"release-{sha}-{run['run_attempt']}"


def verify_manifest(manifest, run, repository):
    if (manifest.get('commit') != run['head_sha'] or manifest.get('run_id') != run['id']
            or manifest.get('run_attempt') != run['run_attempt']
            or manifest.get('platform') != 'linux/amd64'):
        raise ValueError('Release manifest does not match this CI run and attempt')
    prefix = f'ghcr.io/{repository.lower()}-payload@sha256:'
    image = manifest.get('image', '')
    if not re.fullmatch(re.escape(prefix) + r'[0-9a-f]{64}', image):
        raise ValueError('Release image must use the expected registry and immutable digest')
    return {'commit': manifest['commit'], 'image': image}


if __name__ == '__main__':
    try:
        run, workflow = (json.loads(Path(arg).read_text()) for arg in sys.argv[1:3])
        repository = os.environ['GITHUB_REPOSITORY']
        artifact = verify_run(run, workflow, repository)
        if len(sys.argv) == 3:
            print(artifact)
        else:
            result = verify_manifest(json.loads(Path(sys.argv[3]).read_text()), run, repository)
            for key, value in result.items():
                print(f'{key}={value}')
    except (OSError, ValueError, KeyError, TypeError) as error:
        sys.exit(f'Release verification stopped: {error}')
