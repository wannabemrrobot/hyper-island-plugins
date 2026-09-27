#!/usr/bin/env python3
"""Packs and signs every plugin whose version isn't in index.json yet (hi pack --sign: a zip, its SHA-256
and the registry's signature), and adds them to the index with where to download them. Needs the
registry's key in $HI_SIGNING_KEY. Usage: publish.py <hi> <dist folder> <download url base>"""
import glob, json, os, subprocess, sys

hi, dist, base = sys.argv[1], sys.argv[2], sys.argv[3].rstrip("/")
index = json.load(open("index.json"))
published = {(p["id"], p["version"]) for p in index["plugins"]}
os.makedirs(dist, exist_ok=True)
if not os.environ.get("HI_SIGNING_KEY"):
    # Nothing is published unsigned; until the key is set, publishing waits (and says so).
    print("::notice::Not published: HI_SIGNING_KEY isn't set. Add the registry's signing key as that Actions secret (hi keygen; see README).")
    sys.exit(0)

for manifest_path in sorted(glob.glob("plugins/*/manifest.json")):
    m = json.load(open(manifest_path))
    if (m["id"], m["version"]) in published:
        continue
    r = subprocess.run([hi, "pack", os.path.dirname(manifest_path), "--out", dist, "--sign"],
                       stderr=subprocess.PIPE, text=True)
    if r.returncode != 0:
        # hi's own words, on the run's summary page (it never prints the key itself).
        why = r.stderr.strip() or f"hi exited {r.returncode}"
        print(f"::error title=Not published: {m['id']} {m['version']}::{why}")
        sys.exit(1)
    entry = json.load(open(os.path.join(dist, f"{m['id']}-{m['version']}.json")))
    entry["url"] = f"{base}/{entry['file']}"
    index["plugins"] = [p for p in index["plugins"] if p["id"] != m["id"]] + [entry]
    print(f"✓ {m['id']} {m['version']}")

index["plugins"].sort(key=lambda p: p["id"])
with open("index.json", "w") as f:
    json.dump(index, f, indent=2, sort_keys=True)
    f.write("\n")
