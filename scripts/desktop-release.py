#!/usr/bin/env python3
"""Collect native builds, verify signatures, and prepare a release. No network writes."""
import argparse
from base64 import b64decode
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
# Installer-specific updater targets prevent a deb install switching to AppImage.
TARGETS = {
    'macos-arm64': [('macos/*.app.tar.gz', 'app.tar.gz', 'darwin-aarch64-app'),
                    ('dmg/*.dmg', 'dmg', None)],
    'macos-x64': [('macos/*.app.tar.gz', 'app.tar.gz', 'darwin-x86_64-app'),
                  ('dmg/*.dmg', 'dmg', None)],
    'windows-x64': [('nsis/*.exe', 'exe', 'windows-x86_64-nsis')],
    'linux-x64': [('deb/*.deb', 'deb', 'linux-x86_64-deb'),
                  ('appimage/*.AppImage', 'AppImage', 'linux-x86_64-appimage')],
}


def version():
    desktop = json.loads((ROOT / 'apps/desktop/src-tauri/tauri.conf.json').read_text())['version']
    package = json.loads((ROOT / 'package.json').read_text())['version']
    workspace = re.search(r'\[workspace.package\][\s\S]*?version = "([^"]+)"',
                          (ROOT / 'Cargo.toml').read_text())[1]
    if not re.fullmatch(r'\d+\.\d+\.\d+', desktop) or desktop != package or desktop != workspace:
        raise ValueError('Desktop, Cargo workspace, and JS release versions must match')
    return desktop


def expected(release):
    return {f'xnet-community-{release}-{platform}.{ext}': (platform, ext, target)
            for platform, entries in TARGETS.items() for _, ext, target in entries}


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def collect(platform, bundle, output):
    output.mkdir(parents=True, exist_ok=False)
    for pattern, ext, _ in TARGETS[platform]:
        candidates = list(bundle.glob(pattern))
        if len(candidates) != 1:
            raise ValueError(f'Expected one {pattern}, found {len(candidates)}')
        source = candidates[0]
        destination = output / f'xnet-community-{version()}-{platform}.{ext}'
        shutil.copyfile(source, destination)
        shutil.copyfile(Path(str(source) + '.sig'), Path(str(destination) + '.sig'))


def validate_metadata(files, release):
    names = [entry['name'] for entry in files]
    if len(names) != len(set(names)) or set(names) != set(expected(release)):
        raise ValueError('Release must contain exactly one of every supported installer/update')
    for entry in files:
        if entry['size'] <= 0 or not re.fullmatch('[0-9a-f]{64}', entry['sha256']):
            raise ValueError('Invalid artifact size or checksum')


def validate_signature_version(signature, release):
    lines = b64decode(signature, validate=True).decode().splitlines()
    if len(lines) != 4 or not lines[2].startswith('trusted comment: '):
        raise ValueError('Malformed Tauri signature')
    versions = [part for part in lines[2][len('trusted comment: '):].split('\t')
                if part.startswith('version:')]
    if versions != [f'version:{release}']:
        raise ValueError('Signature must bind the exact release version')
    return b64decode(signature, validate=True)


def assemble(artifacts, output, source):
    if not re.fullmatch('[0-9a-f]{40}', source):
        raise ValueError('Release source must be a full commit SHA')
    release = version()
    tag = f'community-v{release}'
    url = f'https://github.com/crs48/xNet/releases/download/{tag}/'
    names = expected(release)
    actual = {p.name for p in artifacts.iterdir() if p.is_file()}
    if actual != set(names) | {name + '.sig' for name in names}:
        raise ValueError('Missing or unexpected release assets')
    output.mkdir(parents=True, exist_ok=False)
    public = json.loads((ROOT / 'apps/desktop/src-tauri/beta.conf.json').read_text())['plugins']['updater']['pubkey']
    files, platforms = [], {}
    with tempfile.TemporaryDirectory() as scratch:
        pub = Path(scratch) / 'public.key'
        pub.write_bytes(b64decode(public, validate=True))
        for name, (platform, ext, target) in names.items():
            artifact = artifacts / name
            signature = (artifacts / (name + '.sig')).read_text().strip()
            proof = Path(scratch) / 'proof.minisig'
            proof.write_bytes(validate_signature_version(signature, release))
            subprocess.run(['minisign', '-V', '-q', '-m', str(artifact), '-p', str(pub),
                            '-x', str(proof)], check=True)
            files.append({'name': name, 'platform': platform, 'format': ext,
                          'size': artifact.stat().st_size, 'sha256': digest(artifact),
                          'url': url + name})
            if target:
                platforms[target] = {'url': url + name, 'signature': signature}
    validate_metadata(files, release)
    date = datetime.now(timezone.utc).isoformat()
    (output / 'latest.json').write_text(json.dumps({
        'version': release, 'pub_date': date,
        'notes': f'xNet Community beta {release}. Self-signed early beta; see xnet.fyi/download.',
        'platforms': platforms,
    }, indent=2) + '\n')
    (output / 'downloads.json').write_text(json.dumps({
        'version': release, 'tag': tag, 'source': source, 'releasedAt': date,
        'publisherVerified': False, 'releaseUrl': f'https://github.com/crs48/xNet/releases/tag/{tag}',
        'files': files,
    }, indent=2) + '\n')
    (output / 'SHA256SUMS').write_text(''.join(f'{entry["sha256"]}  {entry["name"]}\n' for entry in files))
    print(f'Verified {len(files)} signed artifacts and {len(platforms)} updater targets for {tag}.')


def check_channel(previous, release):
    if not re.fullmatch(r'\d+\.\d+\.\d+', previous):
        raise ValueError('Existing beta channel has an unsupported version')
    if tuple(map(int, release.split('.'))) <= tuple(map(int, previous.split('.'))):
        raise ValueError('A public beta must advance the existing channel version')


def selftest():
    # Consumer: CI quality and release preparation. Controls live only in memory.
    files = [{'name': name, 'size': 10, 'sha256': 'a' * 64} for name in expected('1.2.3')]
    validate_metadata(files, '1.2.3')
    mutations = [files[:-1], files + [files[0]], files + [{'name': 'extra', 'size': 1, 'sha256': 'a'*64}]]
    for field, value in [('size', 0), ('sha256', 'invalid'), ('name', '../escape')]:
        changed = deepcopy(files)
        changed[0][field] = value
        mutations.append(changed)
    for changed in mutations:
        try:
            validate_metadata(changed, '1.2.3')
        except ValueError:
            continue
        raise AssertionError('Release validation accepted an invalid asset set')
    from base64 import b64encode
    for comment in ['version:1.2.2', 'version:1.2.30', 'version:1.2.3\tversion:9.0.0', 'timestamp:123']:
        signature = b64encode(f'untrusted comment: test\nproof\ntrusted comment: {comment}\nproof\n'.encode())
        try:
            validate_signature_version(signature, '1.2.3')
        except ValueError:
            continue
        raise AssertionError('Release accepted a mismatched signed version')
    check_channel('0.1.1', '0.1.2')
    for previous in ['0.1.2', '0.1.3', '0.10.0', 'invalid']:
        try:
            check_channel(previous, '0.1.2')
        except ValueError:
            continue
        raise AssertionError('Release allowed a rollback or malformed channel')
    print('Release negative controls passed (in memory).')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--selftest', action='store_true')
    commands = parser.add_subparsers(dest='command')
    one = commands.add_parser('collect')
    one.add_argument('--platform', choices=TARGETS, required=True)
    one.add_argument('--bundle', type=Path, required=True)
    one.add_argument('--output', type=Path, required=True)
    all_builds = commands.add_parser('assemble')
    all_builds.add_argument('--artifacts', type=Path, required=True)
    all_builds.add_argument('--output', type=Path, required=True)
    all_builds.add_argument('--source', required=True)
    guard = commands.add_parser('check-channel')
    guard.add_argument('--current', type=Path, required=True)
    args = vars(parser.parse_args())
    testing = args.pop('selftest')
    command = args.pop('command')
    if testing:
        selftest()
    elif command == 'collect':
        collect(**args)
    elif command == 'assemble':
        assemble(**args)
    elif command == 'check-channel':
        check_channel(json.loads(args['current'].read_text())['version'], version())
    else:
        parser.error('Choose collect, assemble, or --selftest')
