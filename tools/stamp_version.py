#!/usr/bin/env python3
"""Tamponne le build dans le site prêt à publier.
Le numéro de build est une empreinte du contenu : il ne change que si un fichier change,
ce qui déclenche la mise à jour automatique chez les utilisateurs, et seulement dans ce cas.
Usage : python tools/stamp_version.py --site _site [--run 42] [--sha abc1234]"""
import argparse, datetime, hashlib, json, os

ap = argparse.ArgumentParser()
ap.add_argument('--site', default='_site')
ap.add_argument('--run', default='')
ap.add_argument('--sha', default='')
a = ap.parse_args()

h = hashlib.sha256()
for root, _, files in sorted(os.walk(a.site)):
    for name in sorted(files):
        path = os.path.join(root, name)
        rel = os.path.relpath(path, a.site)
        if rel in ('version.json', 'sw.js'):
            continue
        h.update(rel.encode())
        with open(path, 'rb') as f:
            h.update(f.read())
build = h.hexdigest()[:12]

vpath = os.path.join(a.site, 'version.json')
with open(vpath, encoding='utf-8') as f:
    v = json.load(f)
v.update({'build': build, 'run': a.run, 'commit': a.sha,
          'date': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')})
with open(vpath, 'w', encoding='utf-8') as f:
    json.dump(v, f, ensure_ascii=False, indent=2)

for name in ('sw.js', 'index.html'):
    p = os.path.join(a.site, name)
    with open(p, encoding='utf-8') as f:
        s = f.read()
    with open(p, 'w', encoding='utf-8') as f:
        f.write(s.replace('__BUILD__', build))
print(f"Version {v['version']}, build {build}")
