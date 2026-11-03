#!/usr/bin/env python3
"""Exercise native messaging against an already running local demo peer.

This checks framing, scope and real media bytes. It does not claim to test Chrome.
"""
import argparse
import json
import struct
import subprocess
import urllib.request
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--data', type=Path, required=True)
parser.add_argument('--media', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
extension = 'a' * 32
command = [str(root / 'target/debug/community-node'), 'native-host', '--data', str(args.data.resolve()), '--extension', extension, f'chrome-extension://{extension}/']

def request(value):
    payload = json.dumps(value).encode()
    result = subprocess.run(command, input=struct.pack('=I', len(payload)) + payload, capture_output=True, timeout=30, check=True)
    assert len(result.stdout) >= 4, 'Missing native response header'
    size = struct.unpack('=I', result.stdout[:4])[0]
    assert len(result.stdout) == size + 4, 'Invalid response framing'
    return json.loads(result.stdout[4:])

status = request({'op': 'status'})
assert status['ok'] and status['result']['active'], 'Enable contribution in the selected desktop first'
assert set(status['result']) == {'active', 'reason'}, 'Native status leaked profile data'
for operation in ['snapshot', 'messages', 'publish', 'participation', 'send']:
    assert request({'op': operation})['ok'] is False, f'Extension unexpectedly allowed {operation}'
assert request({'op': 'play', 'id': '../identity.key'})['ok'] is False
play = request({'op': 'play', 'id': args.media})
assert play['ok'], play.get('error')
with urllib.request.urlopen(urllib.request.Request(play['result']['url'], headers={'Range': 'bytes=0-63'}), timeout=30) as response:
    assert response.status == 206 and len(response.read()) == 64
for malformed in [b'\x02\x00', struct.pack('=I', 8193), struct.pack('=I', 2) + b'{']:
    assert subprocess.run(command, input=malformed, capture_output=True, timeout=10).returncode != 0
assert subprocess.run(command[:-1] + ['chrome-extension://' + 'b' * 32 + '/'], input=b'', capture_output=True, timeout=10).returncode != 0
print('PASS: native framing, public-only scope, origin rejection, truncated/oversized input rejection, and real range playback through the desktop.')
