#!/usr/bin/env python3
"""Refresh YouTube search signals inside data/formats.json. Leaves the recipes alone."""
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "formats.json"


def top_result(query):
    cmd = [
        "yt-dlp",
        "--flat-playlist",
        "--print",
        "%(view_count)s\t%(title)s",
        f"ytsearch5:{query}",
    ]
    out = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=120)
    best = None
    for line in out.stdout.splitlines():
        views, _, title = line.partition("\t")
        try:
            n = int(views)
        except ValueError:
            continue
        if best is None or n > best[0]:
            best = (n, title.strip())
    return best


def main():
    doc = json.loads(DATA.read_text())
    changed = False
    for item in doc["formats"]:
        query = item.get("query")
        if not query:
            continue
        try:
            hit = top_result(query)
        except (subprocess.SubprocessError, OSError) as exc:
            print(f"skip {item['id']}: {exc}", file=sys.stderr)
            continue
        if not hit:
            print(f"skip {item['id']}: no rows", file=sys.stderr)
            continue
        views, title = hit
        if item.get("signal_views") != views or item.get("signal_title") != title:
            item["signal_views"] = views
            item["signal_title"] = title
            changed = True
        print(f"{item['id']}: {views} | {title}")
    doc["updated"] = date.today().isoformat()
    doc["source"] = (
        "Public YouTube search. Instagram does not publish a format count, "
        "so this is the demand signal, not an Instagram view counter."
    )
    DATA.write_text(json.dumps(doc, indent=2) + "\n")
    if not changed:
        print("signals unchanged")


if __name__ == "__main__":
    main()
