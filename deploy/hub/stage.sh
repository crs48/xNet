#!/bin/sh
# An explicit build context keeps local profiles, databases and private keys off the builder.
set -eu
here=$(CDPATH='' cd -- "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
workspace="$root"
out=${1:?Pass a new staging directory}
mkdir "$out"
cp "$here/Dockerfile" "$here/hub.mjs" "$out/"
for f in gateway.mjs relay.toml; do cp "$root/deploy/hub/$f" "$out/"; done
cp "$here/railway.toml" "$out/"
mkdir -p "$out/crates" "$out/apps/desktop/src-tauri/src" "$out/web"
cp "$workspace/Cargo.toml" "$workspace/Cargo.lock" "$out/"
for crate in network registry node; do
  mkdir "$out/crates/$crate"
  cp -R "$workspace/crates/$crate/src" "$workspace/crates/$crate/Cargo.toml" "$out/crates/$crate/"
done
cp "$workspace/apps/desktop/src-tauri/Cargo.toml" "$out/apps/desktop/src-tauri/"
touch "$out/apps/desktop/src-tauri/src/main.rs"
cp "$workspace"/web/index.html "$workspace"/web/style.css "$workspace"/web/registry.js "$out/web/"
