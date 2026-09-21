#!/usr/bin/env python3
"""Génère data/network.json à partir du GTFS officiel TBM :
couleurs officielles des lignes de tram et tracés réels (shapes), simplifiés.
Exécuté par GitHub Actions à chaque déploiement et chaque nuit.
Usage : python tools/build_network.py [--gtfs fichier.zip] [--out data/network.json]"""
import argparse, csv, io, json, math, sys, urllib.request, zipfile, datetime
from collections import Counter, defaultdict

GTFS_URL = 'https://bdx.mecatran.com/utw/ws/gtfsfeed/static/bordeaux?apiKey=opendata-bordeaux-metropole-flux-gtfs-rt'
TRAM_LINES = ['A', 'B', 'C', 'D', 'E', 'F']
TOLERANCE_M = 4.0


def rows(zf, name):
    with zf.open(name) as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding='utf-8-sig'))


def dist_to_segment(p, a, b):
    k = math.cos(math.radians(p[0])) * 111320
    px, py = p[1] * k, p[0] * 110540
    ax, ay = a[1] * k, a[0] * 110540
    bx, by = b[1] * k, b[0] * 110540
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)


def simplify(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        best, idx = 0, -1
        for k in range(i + 1, j):
            d = dist_to_segment(pts[k], pts[i], pts[j])
            if d > best:
                best, idx = d, k
        if best > tol:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [p for p, k in zip(pts, keep) if k]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--gtfs', help='fichier GTFS local (sinon téléchargement)')
    ap.add_argument('--out', default='data/network.json')
    args = ap.parse_args()

    if args.gtfs:
        data = open(args.gtfs, 'rb').read()
    else:
        req = urllib.request.Request(GTFS_URL, headers={'User-Agent': 'tbm-tram-radar (GitHub Actions)'})
        data = urllib.request.urlopen(req, timeout=180).read()
    zf = zipfile.ZipFile(io.BytesIO(data))

    routes = {}
    for r in rows(zf, 'routes.txt'):
        short = (r.get('route_short_name') or '').strip().upper()
        if short in TRAM_LINES and r.get('route_type', '0').strip() in ('0', '900', ''):
            routes[r['route_id']] = {'line': short, 'color': (r.get('route_color') or '').strip(),
                                     'text': (r.get('route_text_color') or '').strip(), 'name': (r.get('route_long_name') or '').strip()}
    if not routes:
        sys.exit('Aucune ligne de tram trouvée dans routes.txt')

    usage = defaultdict(Counter)
    for t in rows(zf, 'trips.txt'):
        rt = routes.get(t['route_id'])
        sid = (t.get('shape_id') or '').strip()
        if rt and sid:
            usage[rt['line']][sid] += 1

    wanted = {}
    for line, counter in usage.items():
        total = sum(counter.values())
        for sid, n in counter.items():
            if n >= max(3, total * 0.04):
                wanted[sid] = line

    shapes = defaultdict(list)
    if 'shapes.txt' in zf.namelist():
        for s in rows(zf, 'shapes.txt'):
            sid = s['shape_id']
            if sid in wanted:
                shapes[sid].append((int(float(s['shape_pt_sequence'])), float(s['shape_pt_lat']), float(s['shape_pt_lon'])))

    out = {'version': 1, 'source': 'gtfs', 'generated': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'), 'lines': {}}
    for rt in routes.values():
        line = rt['line']
        entry = out['lines'].setdefault(line, {'shapes': []})
        if rt['color'] and 'color' not in entry:
            entry['color'] = '#' + rt['color'].lstrip('#').lower()
        if rt['text'] and 'text' not in entry:
            entry['text'] = '#' + rt['text'].lstrip('#').lower()
        if rt['name'] and 'name' not in entry:
            entry['name'] = rt['name']
    for sid, pts in shapes.items():
        pts.sort()
        coords = simplify([(la, lo) for _, la, lo in pts], TOLERANCE_M)
        out['lines'][wanted[sid]]['shapes'].append([[round(la, 5), round(lo, 5)] for la, lo in coords])

    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    summary = ', '.join(f"{l}: {v.get('color', '?')} {len(v['shapes'])} tracé(s)" for l, v in sorted(out['lines'].items()))
    print(f'network.json écrit ({summary})')


if __name__ == '__main__':
    main()
