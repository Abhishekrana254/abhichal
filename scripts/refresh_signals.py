#!/usr/bin/env python3
"""Refresh known-format numbers, and flag title phrases that are not on the list yet."""
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "formats.json"
DISCOVER = ["ai shorts", "viral ai shorts", "ai animation shorts"]
STOP = {
    "a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with", "from",
    "how", "make", "your", "this", "that", "these", "video", "videos", "short",
    "shorts", "ai", "viral", "youtube", "new", "trend", "trends", "part", "full",
    "tutorial", "free", "kaise", "banaye", "funny", "comedy", "story", "stories",
    "episode", "official", "2024", "2025", "2026", "2027", "best", "top", "you",
    "create", "using", "workflow", "channel", "days", "film", "animated", "animation",
    "posting", "end", "claude", "google",
    "guide", "results", "tried", "realistic", "step", "like", "generator", "image",
    "course", "long", "history", "prompt", "automation", "method", "original",
    "originals", "just", "minutes", "make", "video", "videos",
}


def is_tutorial(title):
    text = title.lower()
    return any(bit in text for bit in ("how to", "how i", "kaise banaye", "tutorial", "full course", "workflow"))


def search(query, n):
    cmd = [
        "yt-dlp",
        "--flat-playlist",
        "--print",
        "%(view_count)s\t%(title)s",
        f"ytsearch{n}:{query}",
    ]
    out = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=120)
    rows = []
    for line in out.stdout.splitlines():
        views, _, title = line.partition("\t")
        try:
            nviews = int(views)
        except ValueError:
            continue
        title = title.strip()
        if title:
            rows.append((nviews, title))
    return rows


def words(title):
    return [w for w in re.findall(r"[a-z0-9]+", title.lower()) if w not in STOP and len(w) > 2]


def known_phrases(doc):
    bag = set()
    for item in doc["formats"]:
        text = f"{item.get('query', '')} {item.get('title', '')}"
        toks = words(text)
        bag.update(toks)
        bag.update(f"{a} {b}" for a, b in zip(toks, toks[1:]))
    return bag


def discover(doc):
    known = known_phrases(doc)
    seen = {}
    for query in DISCOVER:
        try:
            rows = search(query, 15)
        except (subprocess.SubprocessError, OSError) as exc:
            print(f"discover skip {query}: {exc}", file=sys.stderr)
            continue
        for views, title in rows:
            if title in seen:
                seen[title] = max(seen[title], views)
            else:
                seen[title] = views
    buckets = {}
    for title, views in seen.items():
        for phrase in words(title):
            if phrase in known or phrase.isdigit():
                continue
            slot = buckets.setdefault(phrase, {"views": 0, "titles": []})
            if title not in slot["titles"]:
                slot["titles"].append(title)
                slot["views"] += views
    found = []
    for phrase, slot in buckets.items():
        if len(slot["titles"]) < 2:
            continue
        found.append({
            "phrase": phrase,
            "videos": len(slot["titles"]),
            "views": slot["views"],
            "examples": slot["titles"][:3],
        })
    found.sort(key=lambda row: row["views"], reverse=True)
    return found[:5]


def main():
    doc = json.loads(DATA.read_text())
    for item in doc["formats"]:
        query = item.get("query")
        if not query:
            continue
        try:
            rows = search(query, 5)
        except (subprocess.SubprocessError, OSError) as exc:
            print(f"skip {item['id']}: {exc}", file=sys.stderr)
            continue
        if not rows:
            print(f"skip {item['id']}: no rows", file=sys.stderr)
            continue
        ranked = sorted(rows, reverse=True)
        picked = next((row for row in ranked if not is_tutorial(row[1])), ranked[0])
        views, title = picked
        item["signal_views"] = views
        item["signal_title"] = title
        print(f"{item['id']}: {views} | {title}")
    doc["emerging"] = discover(doc)
    for row in doc["emerging"]:
        print(f"new: {row['phrase']} | {row['videos']} videos | {row['views']}")
    doc["updated"] = date.today().isoformat()
    doc["source"] = (
        "Known formats use a fixed YouTube search. A new format is a word that "
        "shows up in two or more different videos from a wide 'ai shorts' search "
        "and is not already on the list. A format that never says its name in the title still will not show up."
    )
    DATA.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
