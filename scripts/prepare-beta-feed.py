#!/usr/bin/env python3
"""Stage local installers and a verified Tauri static feed. Never publish anything."""
import argparse
from base64 import b64decode
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import urljoin


def stage(output, mac, windows, linux, dmg):
    config = Path(__file__).resolve().parents[1] / 'apps/desktop/src-tauri'
    beta = json.loads((config / 'beta.conf.json').read_text())['plugins']['updater']
    version = json.loads((config / 'tauri.conf.json').read_text())['version']
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?', version):
        raise ValueError('Unsupported desktop version')
    if output.exists():
        raise FileExistsError(f'Release directory already exists: {output}')
    output.parent.mkdir(parents=True, exist_ok=True)
    files = [
        ('darwin-aarch64-app', mac, 'macos-arm64.app.tar.gz'),
        ('windows-x86_64-nsis', windows, 'windows-x64-setup.exe'),
        ('linux-x86_64-deb', linux, 'linux-amd64.deb'),
    ]
    with tempfile.TemporaryDirectory(dir=output.parent) as scratch:
        root = Path(scratch)
        staged = root / 'release'
        assets = staged / version
        assets.mkdir(parents=True)
        pub = root / 'updater.pub'
        pub.write_bytes(b64decode(beta['pubkey'], validate=True))
        platforms = {}
        sums = []
        def copy(src, name):
            target = assets / f'xnet-community-{version}-{name}'
            shutil.copyfile(src, target)
            sums.append(f'{hashlib.sha256(target.read_bytes()).hexdigest()}  {target.name}')
            return target
        for target, src, name in files:
            artifact = copy(src, name)
            signature = Path(str(src) + '.sig').read_text().strip()
            proof = root / 'artifact.minisig'
            proof.write_bytes(b64decode(signature, validate=True))
            subprocess.run(['minisign', '-V', '-l', '-q', '-m', str(artifact),
                            '-p', str(pub), '-x', str(proof)], check=True)
            comment = proof.read_text().splitlines()[2]
            if f'version:{version}' not in comment.split('\t'):
                raise ValueError(f'{src.name}: signature does not bind version {version}')
            platforms[target] = {'signature': signature, 'url': urljoin(
                beta['endpoints'][0], f'{version}/{artifact.name}')}
        copy(dmg, 'macos-arm64.dmg')
        (assets / 'SHA256SUMS').write_text('\n'.join(sums) + '\n')
        (staged / 'latest.json').write_text(json.dumps({
            'version': version, 'notes': f'xNet Community beta {version}.',
            'pub_date': datetime.now(timezone.utc).isoformat(), 'platforms': platforms,
        }, indent=2) + '\n')
        staged.rename(output)
    print(f'Verified three updater signatures and staged files in {output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ('output', 'mac', 'windows', 'linux', 'dmg'):
        parser.add_argument('--' + key, type=Path, required=True)
    stage(**vars(parser.parse_args()))
