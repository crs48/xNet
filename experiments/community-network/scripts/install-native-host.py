#!/usr/bin/env python3
"""Register only the explicit unpacked extension ID, for the selected local profile."""
import argparse, json, os, re, shlex, sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--extension-id', required=True)
parser.add_argument('--data', required=True, type=Path)
parser.add_argument('--browser', choices=['chrome', 'chromium'], default='chrome')
args = parser.parse_args()
if not re.fullmatch('[a-p]{32}', args.extension_id):
    parser.error('Expected a Chrome extension ID (32 letters a–p).')
root = Path(__file__).resolve().parents[1]
binary = root / 'target/debug/community-node'
if not binary.is_file():
    parser.error('Build community-node first.')
data = args.data.resolve()
if not (data / 'bridge.json').exists():
    parser.error('Start the chosen desktop profile first.')
directory = root / '.local/native-host'
directory.mkdir(parents=True, exist_ok=True)
launcher = directory / f'{args.extension_id}.sh'
launcher.write_text('#!/bin/sh\nexec ' + ' '.join(shlex.quote(str(x)) for x in [binary, 'native-host', '--data', data, '--extension', args.extension_id]) + ' "$@"\n')
launcher.chmod(0o700)
if sys.platform == 'darwin':
    target = Path.home() / 'Library/Application Support' / ('Google/Chrome' if args.browser == 'chrome' else 'Chromium') / 'NativeMessagingHosts'
elif sys.platform == 'linux':
    target = Path.home() / '.config' / ('google-chrome' if args.browser == 'chrome' else 'chromium') / 'NativeMessagingHosts'
else:
    parser.error('This development registration helper supports macOS and Linux. Windows registration is not implemented.')
target.mkdir(parents=True, exist_ok=True)
manifest = target / 'fyi.xnet.community.json'
if manifest.exists():
    previous = json.loads(manifest.read_text())
    if previous.get('allowed_origins') != [f'chrome-extension://{args.extension_id}/']:
        parser.error('A different extension is already registered. Remove that registration explicitly before replacing it.')
manifest.write_text(json.dumps({'name': 'fyi.xnet.community', 'description': 'xNet local community peer', 'path': str(launcher), 'type': 'stdio', 'allowed_origins': [f'chrome-extension://{args.extension_id}/']}, indent=2))
manifest.chmod(0o600)
print(f'Registered {manifest}\nRemove that file to disconnect this browser.')
