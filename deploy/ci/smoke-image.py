#!/usr/bin/env python3
"""Test a built image against a new Docker volume, without host data or secrets."""
import json
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid


def docker(*args, **kwargs):
    return subprocess.run(['docker', *args], check=True, text=True, capture_output=True,
                          timeout=240, **kwargs).stdout.strip()


def main(image):
    name = 'homepage-ci-' + uuid.uuid4().hex
    volume = name + '-storage'
    env = ['-e', 'NODE_ENV=production', '-e', 'NEXT_TELEMETRY_DISABLED=1',
           '-e', 'PAYLOAD_SECRET=' + secrets.token_hex(32),
           '-e', 'DATABASE_URL=file:/app/storage/database/payload.db',
           '-e', 'MEDIA_DIR=/app/storage/media', '-e', 'SERVER_URL=http://localhost:3000']
    docker('volume', 'create', volume)
    try:
        docker('run', '--rm', '-v', volume + ':/app/storage', *env, image,
               'node', 'node_modules/payload/bin.js', 'migrate')
        seed = """
import {getPayload} from 'payload';
import config from './src/payload.config.ts';
import sharp from 'sharp';
const payload = await getPayload({config});
try {
  await payload.create({collection:'users',data:{email:'ci@example.test',password:'disposable-ci-password-123'}});
  const data = await sharp({create:{width:40,height:40,channels:3,background:'#557799'}}).png().toBuffer();
  const media = await payload.create({collection:'media',data:{alt:'CI cover'},file:{data,mimetype:'image/png',name:'ci.png',size:data.length}});
  await payload.create({collection:'works',data:{title:'Container persistence',slug:'ci-persistence',type:'game',rating:0,note:'Keep my note',visibility:'public',cover:media.id}});
} finally {await payload.destroy();}
"""
        docker('run', '--rm', '-i', '-v', volume + ':/app/storage', *env, image,
               'node', '--import', 'tsx', '--input-type=module', '-', input=seed)
        docker('run', '-d', '--name', name, '-v', volume + ':/app/storage',
               '-p', '127.0.0.1::3000', *env, image)
        port = docker('inspect', '--format', '{{(index (index .NetworkSettings.Ports "3000/tcp") 0).HostPort}}', name)
        origin = 'http://127.0.0.1:' + port

        def request(path, data=None):
            body = None if data is None else json.dumps(data).encode()
            req = urllib.request.Request(origin + path, data=body,
                                         headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=10) as response:
                return response.read()

        def verify():
            deadline = time.monotonic() + 120
            while True:
                try:
                    works = json.loads(request('/api/works?depth=1'))
                    break
                except (OSError, ValueError):
                    if time.monotonic() >= deadline:
                        raise RuntimeError('Container failed readiness check')
                    time.sleep(2)
            work = works['docs'][0]
            assert work['slug'] == 'ci-persistence' and work['rating'] == 0
            assert work['note'] == 'Keep my note'
            assert request('/api/media/file/' + work['cover']['filename']).startswith(b'\x89PNG')
            assert json.loads(request('/api/users/login', {'email': 'ci@example.test',
                              'password': 'disposable-ci-password-123'}))['token']
            try:
                request('/api/users')
                raise AssertionError('Anonymous administrator access was allowed')
            except urllib.error.HTTPError as error:
                assert error.code in (401, 403)
        verify()
        docker('restart', name)
        verify()
        print('PASS: image migrations, API, login, privacy, uploaded media and restart persistence')
    except Exception:
        logs = subprocess.run(['docker', 'logs', '--tail', '80', name], capture_output=True, text=True)
        print(logs.stdout + logs.stderr, file=sys.stderr)
        raise
    finally:
        subprocess.run(['docker', 'rm', '-f', name], capture_output=True)
        subprocess.run(['docker', 'volume', 'rm', volume], capture_output=True)


if __name__ == '__main__':
    main(sys.argv[1])
