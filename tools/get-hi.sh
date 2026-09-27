#!/bin/bash
# The plugin tool, from its pinned release in tools/hi/: checked against the SHA-256 in tools/hi.lock
# before it's unpacked (into tools/.hi/) and run. Prints where hi is.
set -euo pipefail
cd "$(dirname "$0")/.."
while IFS='=' read -r k v; do [ -n "$k" ] && printf -v "HI_$k" '%s' "$v"; done < tools/hi.lock
F="tools/hi/${HI_file:?tools/hi.lock has no file}"
[ -f "$F" ] || { echo "✗ $F isn't there" >&2; exit 1; }
GOT="$(shasum -a 256 "$F" | awk '{print $1}')"
[ "$GOT" = "${HI_sha256:?}" ] || { echo "✗ $F has SHA-256 $GOT, but tools/hi.lock pins $HI_sha256" >&2; exit 1; }
rm -rf tools/.hi && mkdir -p tools/.hi && tar -xzf "$F" -C tools/.hi
[ "$(tools/.hi/hi --version)" = "$HI_version" ] || { echo "✗ hi says it isn't $HI_version" >&2; exit 1; }
echo tools/.hi/hi
