#!/usr/bin/env python3
"""Write only public image/commit metadata, never build inputs or credentials."""
import importlib.util
import json
import os
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location('verify_release', Path(__file__).with_name('verify-release.py'))
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)

run = {'head_sha': os.environ['GITHUB_SHA'], 'id': int(os.environ['GITHUB_RUN_ID']),
       'run_attempt': int(os.environ['GITHUB_RUN_ATTEMPT'])}
manifest = {'commit': run['head_sha'], 'image': sys.argv[1], 'run_id': run['id'],
            'run_attempt': run['run_attempt'], 'platform': 'linux/amd64'}
verifier.verify_manifest(manifest, run, os.environ['GITHUB_REPOSITORY'])
with Path(sys.argv[2]).open('x') as output:
    json.dump(manifest, output, indent=2)
    output.write('\n')
