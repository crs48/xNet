#!/usr/bin/env python3
"""Start three isolated packaged desktops and exercise their real local control bridges."""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

local_http = build_opener(ProxyHandler({}))


class Desktop:
    def __init__(self, binary, directory, name, loopback):
        self.binary = binary
        self.directory = directory / name
        self.name = name
        self.process = None
        if loopback:
            self.directory.mkdir(mode=0o700)
            with sqlite3.connect(self.directory / 'state.sqlite') as db:
                db.execute('CREATE TABLE kv(key TEXT PRIMARY KEY, data TEXT NOT NULL)')
                db.execute('INSERT INTO kv VALUES (?, ?)', ('transport:sockets', '["127.0.0.1:0"]'))

    def start(self):
        previous = self.directory / 'bridge.json'
        old_info = previous.read_bytes() if previous.exists() else None
        self.process = subprocess.Popen([self.binary], env={
            **os.environ, 'XNET_COMMUNITY_DATA': str(self.directory),
            'XNET_COMMUNITY_LABEL': f'xNet test · {self.name}',
        })
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                raise RuntimeError(f'{self.name} exited with {self.process.returncode}')
            try:
                data = previous.read_bytes()
                if data != old_info:
                    self.bridge = json.loads(data)
                    return self.call('snapshot')
            except (FileNotFoundError, json.JSONDecodeError, URLError):
                pass
            time.sleep(.1)
        raise TimeoutError(f'{self.name} desktop did not start')

    def call(self, op, **arguments):
        request = Request(f'http://127.0.0.1:{self.bridge["port"]}/control',
                          data=json.dumps(dict(op=op, **arguments)).encode(),
                          headers={'Authorization': 'Bearer ' + self.bridge['token'],
                                   'Content-Type': 'application/json'})
        try:
            with local_http.open(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as exc:
            raise RuntimeError(f'{self.name} {op}: {exc.code} {exc.read().decode()}') from exc

    def close(self):
        if self.process is not None and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(10)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()


def require(condition, explanation):
    if not condition:
        raise RuntimeError(explanation)


def messages(peer, room):
    return [entry['payload']['body'] for entry in peer.call('messages', id=room)]


def check(binary, directory, loopback):
    owner, guest, friend = desktops = [Desktop(binary, directory, name, loopback)
                                      for name in ('Alex', 'Sam', 'Jo')]
    try:
        identities = []
        for peer in desktops:
            identities.append(peer.start()['id'])
            peer.call('account', name=peer.name)
            peer.call('participation', settings={'enabled': True, 'storage_mb': 10, 'upload_mb': 10})
        require(len(set(identities)) == 3, 'Profiles must have distinct device keys')
        pair = owner.call('create_room', title='A private conversation', private=True)['id']
        guest.call('join', link=owner.call('invite', id=pair)['link'])
        owner.call('send', id=pair, body='Can you see this?')
        guest.call('send', id=pair, body='Yes, from my own profile.')
        expected = ['Can you see this?', 'Yes, from my own profile.']
        require(messages(guest, pair) == expected == messages(owner, pair), 'Pair history mismatch')
        print('Two-person private room exchanged both messages.', flush=True)
        group = guest.call('create_room', title='Weekend plans', private=True)['id']
        invite = guest.call('invite', id=group)['link']
        for peer in (owner, friend):
            peer.call('join', link=invite)
        for peer in desktops:
            peer.call('send', id=group, body=peer.name)
        for peer in desktops:
            require(messages(peer, group) == ['Alex', 'Sam', 'Jo'], 'Group history mismatch')
        require(pair not in [r['id'] for r in friend.call('snapshot')['rooms']],
                'A group member unexpectedly gained the private room')
        print('Three-member private group exchanged messages.', flush=True)
        owner.close()
        require(owner.start()['id'] == identities[0], 'Identity changed after restart')
        guest.call('send', id=pair, body='Welcome back.')
        require(messages(owner, pair) == expected + ['Welcome back.'], 'Restart lost history')
        print('Identity, invitation, and history survived restarting the room owner.', flush=True)
    finally:
        for peer in reversed(desktops):
            peer.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('desktop', type=Path, help='installed executable or a macOS .app bundle')
    parser.add_argument('--loopback', action='store_true',
                        help='bind the test peers to loopback, independent of host LAN/VPN routing')
    args = parser.parse_args()
    binary = args.desktop.resolve(strict=True)
    if binary.suffix == '.app':
        import plistlib
        plist = plistlib.loads((binary / 'Contents/Info.plist').read_bytes())
        binary = binary / 'Contents/MacOS' / plist['CFBundleExecutable']
    with tempfile.TemporaryDirectory(prefix='xnet-desktop-check-') as scratch:
        check(binary, Path(scratch), args.loopback)
