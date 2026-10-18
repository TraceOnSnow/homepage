#!/usr/bin/env python3
"""One-shot, read-only upstream diagnostics; no credentials are written to disk."""
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
EVIDENCE = Path('/home/trace/projects/homepage-deployment/evidence')
REPO = Path('/home/trace/projects/homepage')
CONTAINER = 'homepage-local-production-payload-1'


def git(*args):
    return subprocess.check_output(['git', '-C', str(REPO), *args], text=True).strip()


def main():
    run = EVIDENCE / ('metadata-network-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'))
    run.mkdir(mode=0o700)
    probe = BASE / 'metadata-network-probe.mjs'
    saved_probe = run / probe.name
    saved_probe.write_text(probe.read_text())
    saved_probe.chmod(0o600)
    result = subprocess.run(
        ['docker', 'exec', '-i', CONTAINER, 'node', '--input-type=module'],
        input=probe.read_text(), capture_output=True, text=True, timeout=65,
    )
    records = []
    for line in result.stdout.splitlines():
        event = json.loads(line)
        body = event.pop('responseBody', None)
        if body is not None:
            body_file = run / (event['id'] + '-response.txt')
            body_file.write_text(body)
            body_file.chmod(0o600)
            event['responseBodyFile'] = body_file.name
        records.append(event)
    log = run / 'requests.jsonl'
    log.write_text(''.join(json.dumps(event, ensure_ascii=False) + '\n' for event in records))
    log.chmod(0o600)
    access = subprocess.run(
        ['docker', 'logs', '--timestamps', '--since', '2026-10-15T00:00:00Z', 'homepage-web-nginx-1'],
        capture_output=True, text=True, check=True,
    )
    events = []
    for line in (access.stdout + '\n' + access.stderr).splitlines():
        if '/api/metadata/' not in line:
            continue
        match = re.search(r'"(?:GET|POST) (/api/metadata/[^ ]*) HTTP/[^\"]+" (\d+) (\d+)', line)
        if not match:
            continue
        url, status, body_bytes = match.groups()
        kind = re.search(r'(?:\?|&)type=([^& ]+)', url)
        events.append({
            'atUtc': line.split(' ', 1)[0], 'route': url.split('?', 1)[0],
            'workType': kind.group(1) if kind else None,
            'status': int(status), 'responseBytes': int(body_bytes),
        })
    meta = json.loads(subprocess.check_output(['docker', 'inspect', CONTAINER], text=True))[0]
    compared = ['services/payload/src/lib/metadata', 'services/payload/package-lock.json',
                'services/payload/Dockerfile', 'deploy/server/compose.yaml']
    snapshot = {
        'collectedAtUtc': datetime.now(timezone.utc).isoformat(),
        'currentCommit': git('rev-parse', 'HEAD'),
        'workingTreeClean': not bool(git('status', '--porcelain')),
        'providerFilesUnchangedFromPriorDeployment': not bool(git('diff', '--name-only', 'e97b11c', 'HEAD', '--', *compared)),
        'payloadContainer': {
            'image': meta['Config']['Image'], 'running': meta['State']['Running'],
            'health': meta['State'].get('Health', {}).get('Status'),
            'startedAt': meta['State']['StartedAt'],
        },
        'nginxMetadataAccessEvents': events,
        'accessLogLimitations': 'Queries, client addresses and auth data omitted. Bodies were never logged. HTTP 200 may contain provider errors. Retained logs do not establish full history.',
        'probeExitCode': result.returncode,
        'probeStderrPresent': bool(result.stderr),
    }
    snapshot_file = run / 'deployment-and-access-history.json'
    snapshot_file.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n')
    snapshot_file.chmod(0o600)
    print(json.dumps({'evidenceDirectory': str(run), 'probeExitCode': result.returncode,
                      'requestCount': sum(event.get('event') == 'request' for event in records),
                      'payloadHealth': snapshot['payloadContainer']['health']}, ensure_ascii=False))
    if result.returncode:
        raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
