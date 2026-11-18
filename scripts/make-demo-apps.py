#!/usr/bin/env python3
"""Build local macOS launchers for two independent development profiles."""
import plistlib, shlex, shutil
from pathlib import Path
root = Path(__file__).resolve().parents[1]
binary = root / 'target/debug/community-desktop'
if not binary.is_file():
    raise SystemExit('Build community-desktop with tauri/custom-protocol first.')
for label in ['Maya', 'Leo']:
    bundle = root / '.local' / f'xNet {label}.app'
    executable = bundle / 'Contents/MacOS/launch'
    executable.parent.mkdir(parents=True, exist_ok=True)
    resources = bundle / 'Contents/Resources'
    resources.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / 'apps/desktop/src-tauri/icons/icon.icns', resources / 'xnet.icns')
    data = root / '.local' / label.lower()
    executable.write_text('#!/bin/sh\nexport XNET_COMMUNITY_DATA=' + shlex.quote(str(data)) + '\nexport XNET_COMMUNITY_LABEL=' + shlex.quote(label) + '\nexec ' + shlex.quote(str(binary)) + '\n')
    executable.chmod(0o755)
    (bundle / 'Contents/Info.plist').write_bytes(plistlib.dumps({'CFBundleExecutable':'launch','CFBundleIdentifier':f'fyi.xnet.community.demo.{label.lower()}','CFBundleName':f'xNet {label}','CFBundleDisplayName':f'xNet {label}','CFBundleIconFile':'xnet.icns','CFBundlePackageType':'APPL','CFBundleVersion':'2','NSHighResolutionCapable':True,'NSAppTransportSecurity':{'NSAllowsLocalNetworking':True},'NSLocalNetworkUsageDescription':'Connect directly to community peers.'}))
    print(bundle)
