"""Smoke-test a staged hub with real community-registry and iroh-relay binaries on PATH."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

base = 'http://127.0.0.1:14391'

def call(path, data=None, content_type='application/json'):
    req = Request(base + path, data=data, headers={'Content-Type': content_type})
    try:
        with urlopen(req, timeout=3) as response:
            return response.status, response.read()
    except HTTPError as error:
        return error.code, error.read()

def check(condition, reason):
    if not condition:
        raise RuntimeError(reason)

def verify(staged, mode):
    with tempfile.TemporaryDirectory() as directory:
        env = dict(os.environ, HUB_MODE=mode, RELAY_DATA_DIR=directory, PORT='14391',
                   TRACKER_RELAY_URL='https://hub.example', BOOTSTRAP_ENDPOINTS='11' * 32,
                   TRACKER_REQUESTS_PER_MINUTE='12', TRACKER_MAX_IN_FLIGHT='4')
        proc = subprocess.Popen(['node', str(staged / 'hub.mjs')], env=env)
        try:
            deadline = time.monotonic() + 15
            while proc.poll() is None and time.monotonic() < deadline:
                try:
                    code, raw = call('/hub/ready')
                    if code == 200 and json.loads(raw)['mode'] == mode:
                        break
                except URLError:
                    pass
                time.sleep(.15)
            else:
                raise RuntimeError('Hub failed to start in ' + mode)
            tracker = mode in ('tracker','both')
            relay = mode in ('relay','both')
            check(call('/api/catalog')[0] == (200 if tracker else 404), 'Incorrect tracker routing')
            check(call('/capabilities')[0] == (200 if relay else 404), 'Incorrect relay routing')
            check(call('/media/' + '0' * 64)[0] == 404, 'Hub exposed a file endpoint')
            if tracker:
                check(call('/api/announce', b'0' * 99000)[0] == 413, 'Oversized announcement accepted')
                check(call('/api/announce', b'abc', 'video/mp4')[0] == 415, 'Video body accepted')
                check(call('/api/announce', b'{}')[0] >= 400, 'Unsigned announcement accepted')
                for _ in range(14):
                    code, _ = call('/api/catalog')
                check(code == 429 and call('/hub/ready')[0] == 200, 'Quota affected readiness')
            print(mode + ' passed', flush=True)
        finally:
            proc.terminate()
            proc.wait(timeout=10)

if __name__ == '__main__':
    for mode in ('tracker','relay','both'):
        verify(Path(sys.argv[1]).resolve(), mode)
