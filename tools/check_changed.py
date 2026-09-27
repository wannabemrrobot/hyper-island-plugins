#!/usr/bin/env python3
"""The plugins a pull request changed: hi check and hi bench each, its folder named after its id,
and its version bumped if it was already here. Usage: check_changed.py <base sha> <hi>"""
import json, os, subprocess, sys

base, hi = sys.argv[1], sys.argv[2]
changed = subprocess.run(["git", "diff", "--name-only", base, "HEAD", "--", "plugins"],
                         capture_output=True, text=True, check=True).stdout.split()
folders = sorted({p.split("/")[1] for p in changed if p.count("/") >= 2})
failed = False

def old_version(folder):
    r = subprocess.run(["git", "show", f"{base}:plugins/{folder}/manifest.json"], capture_output=True, text=True)
    return json.loads(r.stdout).get("version") if r.returncode == 0 else None

for folder in folders:
    path = os.path.join("plugins", folder)
    if not os.path.isdir(path):
        print(f"{folder}: removed")
        continue
    manifest = json.load(open(os.path.join(path, "manifest.json")))
    if manifest.get("id") != folder:
        print(f"✗ {folder}: the folder must be named after its id ({manifest.get('id')})"); failed = True
    before = old_version(folder)
    if before is not None and before == manifest.get("version"):
        print(f"✗ {folder}: changed, but its version is still {before} — bump it"); failed = True
    for cmd in (["check", path], ["bench", path, "--runs", "1000"]):
        if subprocess.run([hi] + cmd).returncode != 0:
            failed = True

if not folders:
    print("no plugins changed")
sys.exit(1 if failed else 0)
