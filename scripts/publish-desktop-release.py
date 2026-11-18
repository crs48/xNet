#!/usr/bin/env python3
"""Publish or resume the exact verified beta; never replace an existing asset."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile

spec = importlib.util.spec_from_file_location('desktop_release', Path(__file__).with_name('desktop-release.py'))
release_tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release_tools)


def plan(existing, expected, source):
    if existing is None:
        return sorted(expected)
    if existing['target_commitish'] != source:
        raise ValueError('Existing release belongs to a different source commit')
    names = [asset['name'] for asset in existing['assets']]
    if len(names) != len(set(names)) or set(names) - expected:
        raise ValueError('Existing release contains unexpected or duplicate assets')
    missing = expected - set(names)
    if missing and not existing['draft']:
        raise ValueError('A published release is incomplete; inspect it without overwriting assets')
    return sorted(missing)


def gh(*args):
    return subprocess.check_output(['gh', *args], text=True)


def select_release(pages, tag):
    matches = [release for page in pages for release in page if release['tag_name'] == tag]
    if len(matches) > 1:
        raise ValueError('Multiple releases use this tag; inspect before resuming')
    return matches[0] if matches else None


def lookup(tag):
    # Listing includes drafts for this write-capable token; the tag endpoint does not.
    listing = gh('api', '--paginate', 'repos/crs48/xNet/releases?per_page=100',
                 '--jq', '.[] | tojson')
    return select_release([[json.loads(line) for line in listing.splitlines()]], tag)


def check_feed(previous, previous_downloads, latest, downloads, published):
    if previous['version'] != latest['version'] or not published:
        release_tools.check_channel(previous['version'], latest['version'])
    elif previous != latest or previous_downloads != downloads:
        raise ValueError('Existing same-version feed differs from the verified release')


def publish(directory, source, notes, channel):
    version = release_tools.version()
    tag = f'community-v{version}'
    manifest = json.loads((directory / 'verified/downloads.json').read_text())
    if manifest['source'] != source or manifest['version'] != version or manifest['tag'] != tag:
        raise ValueError('Verified artifacts do not match this release source and version')
    paths = [p for sub in ('artifacts', 'verified') for p in (directory / sub).iterdir()]
    files = {p.name: p for p in paths}
    if len(files) != len(paths):
        raise ValueError('Duplicate release asset names')
    expected = set(release_tools.expected(version))
    expected |= {name + '.sig' for name in expected}
    expected |= {'latest.json', 'downloads.json', 'SHA256SUMS'}
    if set(files) != expected or not all(path.is_file() for path in files.values()):
        raise ValueError('Unexpected verified release directory')
    existing = lookup(tag)
    missing = plan(existing, expected, source)
    # A matching tag must not have been moved independently of the release.
    tags = subprocess.check_output(
        ['git', 'ls-remote', 'origin', f'refs/tags/{tag}', f'refs/tags/{tag}^{{}}'], text=True)
    if tags:
        refs = dict(line.split()[::-1] for line in tags.splitlines())
        tagged = refs.get(f'refs/tags/{tag}^{{}}', refs.get(f'refs/tags/{tag}'))
        if tagged != source:
            raise ValueError('Release tag points to a different commit')
    if existing:
        with tempfile.TemporaryDirectory() as scratch:
            for name in expected - set(missing):
                remote = Path(scratch) / name
                gh('release', 'download', tag, '--repo', 'crs48/xNet', '--pattern', name,
                   '--output', str(remote))
                if release_tools.digest(remote) != release_tools.digest(files[name]):
                    raise ValueError(f'Immutable release asset differs: {name}; use a new version')
    if (channel / 'latest.json').exists():
        previous = json.loads((channel / 'latest.json').read_text())
        previous_downloads = (json.loads((channel / 'downloads.json').read_text())
                              if (channel / 'downloads.json').exists() else None)
        check_feed(previous, previous_downloads,
                   json.loads(files['latest.json'].read_text()), manifest,
                   bool(existing and not existing['draft']))
    if existing is None:
        gh('release', 'create', tag, '--repo', 'crs48/xNet', '--target', source,
           '--title', f'xNet Community beta {version}', '--notes-file', str(notes),
           '--draft', '--prerelease', '--latest=false')
    if missing:
        gh('release', 'upload', tag, '--repo', 'crs48/xNet', *[str(files[name]) for name in missing])
    if existing is None or existing['draft']:
        gh('release', 'edit', tag, '--repo', 'crs48/xNet', '--draft=false', '--prerelease', '--latest=false')
    print(f'{tag}: complete immutable assets are public; the feed may now advance.')


def selftest():
    source = 'a' * 40
    expected = {'installer', 'signature', 'manifest'}
    base = {'target_commitish': source, 'draft': True, 'assets': [{'name': 'installer'}]}
    assert plan(None, expected, source) == sorted(expected)
    assert plan(base, expected, source) == ['manifest', 'signature']
    complete = {**base, 'draft': False, 'assets': [{'name': name} for name in expected]}
    assert plan(complete, expected, source) == []
    tag = 'community-v0.1.2'
    draft = {**base, 'tag_name': tag}
    assert select_release([[{'tag_name': 'other'}], [draft]], tag) == draft
    assert select_release([[]], tag) is None
    latest = {'version': '0.1.2', 'platforms': {'mac': 'signed-url'}}
    downloads = {'version': '0.1.2', 'source': source}
    check_feed(latest, downloads, latest, downloads, True)
    for operation in [
        lambda: select_release([[draft], [draft]], tag),
        lambda: check_feed({**latest, 'platforms': {}}, downloads, latest, downloads, True),
        lambda: check_feed(latest, {**downloads, 'source': 'b' * 40}, latest, downloads, True),
        lambda: check_feed(latest, None, latest, downloads, True),
        lambda: check_feed(latest, downloads, latest, downloads, False),
        lambda: check_feed({'version': '0.1.3'}, downloads, latest, downloads, True),
    ]:
        try:
            operation()
        except ValueError:
            continue
        raise AssertionError('Release recovery accepted ambiguous drafts or changed feeds')
    for bad in [dict(base, target_commitish='b' * 40), dict(base, draft=False),
                dict(base, assets=[{'name': 'unexpected'}]),
                dict(base, assets=[{'name': 'installer'}, {'name': 'installer'}])]:
        try:
            plan(bad, expected, source)
        except ValueError:
            continue
        raise AssertionError('Release recovery accepted an unsafe existing release')
    print('Publication negative controls passed (in memory).')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--selftest', action='store_true')
    parser.add_argument('--directory', type=Path)
    parser.add_argument('--source')
    parser.add_argument('--notes', type=Path)
    parser.add_argument('--channel', type=Path, default=Path('current-channel'))
    args = vars(parser.parse_args())
    if args.pop('selftest'):
        selftest()
    elif all(args[key] is not None for key in ('directory', 'source', 'notes')):
        publish(**args)
    else:
        parser.error('directory, source and notes are required')
