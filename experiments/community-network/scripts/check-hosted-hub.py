"""Exercise an explicitly selected hub with two isolated desktop profiles and synthetic content."""
import argparse
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import runpy
import struct
import time
import wave
from urllib.request import urlopen

desktop_tools = runpy.run_path(str(Path(__file__).with_name('check-desktop-chat.py')))
Desktop = desktop_tools['Desktop']
require = desktop_tools['require']


def make_sound(path, hz=220):
    with wave.open(str(path), 'wb') as out:
        out.setparams((1, 2, 24000, 0, 'NONE', ''))
        out.writeframes(b''.join(struct.pack('<h', round(1800 * math.sin(2 * math.pi * hz * i / 24000)
                                                 * min(1, i / 2400, (191999 - i) / 2400)))
                                 for i in range(192000)))


def run(binary, directory, hub, leave_open):
    # Disable IP on both control endpoints. A successful chat must use the public relay.
    os.environ.update(XNET_COMMUNITY_REGISTRY=hub, XNET_COMMUNITY_RELAY_ONLY='1')
    owner, guest = [Desktop(binary, directory, name, False) for name in ('Host', 'Guest')]
    complete = False
    try:
        ids = []
        for desktop in (owner, guest):
            state = desktop.start()
            ids.append(state['id'])
            desktop.call('account', name='Demo ' + desktop.name)
            desktop.call('participation', settings={'enabled': True, 'storage_mb': 32, 'upload_mb': 32})
        room = owner.call('create_room', title='Hub test conversation', private=True)['id']
        invitation = owner.call('invite', id=room)['link']
        prefix, token = invitation.split('#invite=')
        with urlopen(prefix, timeout=15) as page:
            require(page.status == 200, 'Private invitation landing page unavailable')
        bad = json.loads(base64.urlsafe_b64decode(token + '=' * (-len(token) % 4)))
        bad['secret'] = 'invalid'
        try:
            guest.call('join', link=prefix + '#invite=' + base64.urlsafe_b64encode(json.dumps(bad).encode()).decode().rstrip('='))
        except RuntimeError as exc:
            require('Invitation not accepted' in str(exc), str(exc))
        else:
            raise RuntimeError('Room accepted an invalid private grant')
        guest.call('join', link=invitation)
        owner.call('send', id=room, body='Hello from the first desktop.')
        guest.call('send', id=room, body='Received through the public relay.')
        require(desktop_tools['messages'](guest, room) == desktop_tools['messages'](owner, room)
                and len(desktop_tools['messages'](owner, room)) == 2, 'Chat did not converge')
        require(room not in urlopen(hub + '/api/catalog').read().decode(), 'Private room listed publicly')
        print('Private link verified. Invalid room secret rejected. Bidirectional chat used the relay.', flush=True)

        path = directory / 'community-test-tone.wav'
        make_sound(path)
        payload = path.read_bytes()
        record = owner.call('publish', path=str(path), title='Community test tone',
                            description='An eight-second synthetic tone for the xNet seeding demo.')
        content_id = hashlib.sha256(payload).hexdigest()
        require(record['payload']['id'] == content_id, 'Publisher hash mismatch')
        link = hub + '/watch/' + content_id
        require(urlopen(link, timeout=12).status == 200, 'Public share link did not resolve')
        # Hosting explicitly opts in to retaining and announcing a verified copy.
        guest.call('hosting', id=content_id, allowed=True)
        playback = guest.call('play', id=content_id)
        require(desktop_tools['local_http'].open(playback['url'], timeout=15).read() == payload, 'Playback bytes differ')
        item = json.load(urlopen(hub + '/api/items/' + content_id, timeout=12))
        require(set(ids) <= {p['id'] for p in item['providers']}, 'Tracker did not list both peers')
        require(all(all('Relay' in address for address in p['addrs']) for p in item['providers']), 'Tracker exposed a direct address')
        print(f'{len(payload)} bytes verified. Public tracker lists both seeding devices.\n{link}', flush=True)
        guest.call('hosting', id=content_id, allowed=False)
        after = json.load(urlopen(hub + '/api/items/' + content_id, timeout=12))
        require(ids[1] not in {p['id'] for p in after['providers']}, 'Withdrawn seeder is still listed')
        guest.call('hosting', id=content_id, allowed=True)
        protected = owner.call('create_room', title='Private files test', private=True)['id']
        hidden = directory / 'room-test-tone.wav'
        make_sound(hidden, hz=330)
        label = 'Room-only synthetic recording'
        private_link = owner.call('share_private', path=str(hidden), title=label, description='', room=protected)['link']
        handle = private_link.rsplit('/',1)[1]
        page = urlopen(private_link, timeout=12).read().decode()
        require(label not in page and handle not in urlopen(hub + '/api/catalog').read().decode(), 'Private file appeared publicly')
        try:
            guest.call('play_private', id=handle)
        except RuntimeError as exc:
            require('unavailable' in str(exc).lower(), str(exc))
        else:
            raise RuntimeError('A forwarded private link disclosed a file')
        guest.call('join', link=owner.call('invite', id=protected)['link'])
        deadline = time.monotonic() + 75
        while True:
            try:
                private = guest.call('play_private', id=handle)
                break
            except RuntimeError:
                if time.monotonic() >= deadline: raise
                time.sleep(1)
        require(desktop_tools['local_http'].open(private['url'], timeout=30).read()==hidden.read_bytes(), 'Private bytes mismatch')
        owner.call('room_action',id=protected,command={'action':'member','member':ids[1],'role':'remove','reason':'Test end of access'})
        try:
            desktop_tools['local_http'].open(private['url'], timeout=20).read()
        except desktop_tools['HTTPError'] as exc:
            require(exc.code in (400,403), 'Unexpected playback failure after removal')
        else:
            raise RuntimeError('Previous playback ticket survived removal')
        print('Private link denied before joining, played after joining and stopped after removal.', flush=True)
        complete = True
    finally:
        if not (leave_open and complete):
            for peer in (guest, owner):
                peer.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('binary', type=Path)
    parser.add_argument('directory', type=Path, help='isolated profiles; Host/identity.key must be trusted by the hub')
    parser.add_argument('--hub', required=True)
    parser.add_argument('--leave-open', action='store_true')
    args = parser.parse_args()
    run(args.binary.resolve(strict=True), args.directory.resolve(strict=True), args.hub.rstrip('/'), args.leave_open)
