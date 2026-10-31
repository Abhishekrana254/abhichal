#!/usr/bin/env python3
"""Rebuild the list from a wide YouTube search. No format name is typed in."""
import json
import re
from datetime import date
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "formats.json"
RECIPES = ROOT / "data" / "recipes.json"
QUERIES = ["ai shorts", "reels", "funny shorts"]
# YouTube "this month" style filter. The query itself names no format.
SP = "CAMSBggCEAEYAw%3D%3D"
STOP = {
    "a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with", "from",
    "how", "make", "your", "this", "that", "these", "video", "videos", "short",
    "shorts", "youtube", "new", "trend", "trends", "trending", "part", "full",
    "official", "best", "top", "you", "just", "what", "when", "where", "who",
    "will", "can", "its", "are", "was", "were", "not", "but", "all", "out", "get",
    "one", "two", "into", "over", "than", "then", "also", "only", "very", "more",
    "most", "some", "any", "our", "their", "his", "her", "she", "him", "they",
    "them", "now", "see", "today", "instagram", "reels", "reel", "live",
    "livestream", "viral", "viralvideo", "shortvideo", "ytshorts", "like",
    "episode", "series", "latest", "watch", "dont", "didn",
}
BAD = (
    "how to", "how i", "kaise banaye", "kaise bana", "tutorial", "full course",
    "workflow",     "trending song", "compilation", "top 10", "top viral reels",
    "welcome to our", "official youtube channel",
)


def search(query):
    url = "https://www.youtube.com/results?search_query=" + query.replace(" ", "+") + "&sp=" + SP
    cmd = [
        "yt-dlp", "--flat-playlist", "--playlist-end", "30",
        "--print", "%(view_count)s\t%(title)s", url,
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


def tokens(title):
    found = re.findall(r"[^\W\d_]{3,}", title.lower(), flags=re.UNICODE)
    return [w for w in found if w not in STOP]


def same_video(a, b):
    left, right = set(tokens(a)), set(tokens(b))
    if not left or not right:
        return True
    return len(left & right) / min(len(left), len(right)) >= 0.5


def skipped(title):
    text = title.lower()
    return any(bit in text for bit in BAD)


def match_recipe(text, recipes):
    hay = text.lower()
    for recipe in recipes:
        if any(word in hay for word in recipe["words"]):
            return recipe
    return None


def main():
    recipes = json.loads(RECIPES.read_text())
    seen = {}
    for query in QUERIES:
        try:
            rows = search(query)
        except (subprocess.SubprocessError, OSError) as exc:
            print(f"skip {query}: {exc}", file=sys.stderr)
            continue
        print(f"{query}: {len(rows)}")
        for views, title in rows:
            if skipped(title):
                continue
            seen[title] = max(seen.get(title, 0), views)

    buckets = {}
    for title, views in seen.items():
        toks = tokens(title)
        phrases = [f"{a} {b}" for a, b in zip(toks, toks[1:])]
        for phrase in set(phrases):
            parts = phrase.split()
            if any("short" in part or "video" in part for part in parts):
                continue
            slot = buckets.setdefault(phrase, {"views": 0, "titles": []})
            if any(same_video(title, old) for old in slot["titles"]):
                continue
            slot["titles"].append(title)
            slot["views"] += views

    groups = []
    for phrase, slot in buckets.items():
        if len(slot["titles"]) < 2:
            continue
        groups.append((slot["views"], phrase, slot["titles"]))
    groups.sort(reverse=True)

    formats = []
    used_titles = set()
    recipe_seen = False
    for views, phrase, titles in groups[:8]:
        titles = sorted(titles, key=lambda t: seen[t], reverse=True)
        recipe = match_recipe(phrase + " " + " ".join(titles), recipes)
        free = False
        if recipe and not recipe_seen:
            free = True
            recipe_seen = True
        formats.append({
            "id": phrase.replace(" ", "-"),
            "rank": f"#{len(formats) + 1}",
            "title": phrase,
            "kind": "repeated",
            "signal_views": views,
            "signal_title": titles[0],
            "examples": titles[:3],
            "videos": len(titles),
            "free": free if recipe else True,
            "lasts": recipe["lasts"] if recipe else "It stays while these words keep showing up on different videos. Next scan can drop it.",
            "what": f"These two words showed up together on {len(titles)} different videos in this scan. Combined views {views:,}.",
            "make": recipe["make"] if recipe else [],
            "tools": recipe["tools"] if recipe else "",
            "avoid": recipe["avoid"] if recipe else "",
        })
        used_titles.update(titles)
        print(f"repeat {phrase}: {len(titles)} videos, {views}")

    if len(formats) < 5:
        leftover = sorted(seen.items(), key=lambda item: item[1], reverse=True)
        for title, views in leftover:
            if title in used_titles:
                continue
            formats.append({
                "id": f"video-{len(formats) + 1}",
                "rank": f"#{len(formats) + 1}",
                "title": title,
                "kind": "video",
                "signal_views": views,
                "signal_title": title,
                "examples": [title],
                "videos": 1,
                "free": True,
                "lasts": "One video. It has not repeated often enough to call it a format.",
                "what": "Highest videos from this scan that did not share a phrase with another video.",
                "make": [],
                "tools": "",
                "avoid": "",
            })
            print(f"video {views} | {title[:80]}")
            if len(formats) >= 8:
                break

    doc = {
        "updated": date.today().isoformat(),
        "source": (
            "Built from a YouTube search for recent ai shorts, reels, and funny shorts. "
            "No format name is typed in. A card is a two-word phrase that showed up on more than one video. "
            "A phrase that is not in the title still will not be grouped."
        ),
        "formats": formats,
    }
    DATA.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {len(formats)} cards from {len(seen)} videos")


if __name__ == "__main__":
    main()
