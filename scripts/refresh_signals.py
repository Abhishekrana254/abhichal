#!/usr/bin/env python3
"""Find formats from YouTube's own suggestions, then rank them by video views.

The stems are only "ai" plus each letter. Baby, horror, dance, and the rest
are kept only if YouTube suggests them.
"""
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "formats.json"
RECIPES = ROOT / "data" / "recipes.json"
GENERIC = {"ai", "video", "videos", "short", "shorts", "viral", "youtube", "wala", "wali"}
LANG = {"hindi", "english", "tamil", "malayalam", "chinese", "odia", "nepali", "full"}
DROP = (
    "kaise", "how to", "how i", "course", "tutorial", "generator", "roadmap",
    "prompt", "tools", "tool ", "editing", "editor", "monetization", "jobs",
    "job ", "review", "news", "photo", "image", "website", "glasses",
    "smartphone", "quiz", "question", "explained", "basics", "kya hai",
    "kya hota", "matlab", "use kare", "sikhe", "updates", "full movie",
    "workflow", "app", "unit ", "roadmap", "link", "channel kaise",
    "song", "songs", "remix", "bhajan", "phone", "nova", "engineer",
    "bubble", "interview", "robot", "agents", "masterclass", "quantum",
    "ugc", "youtube", "data center", "qawwali", "xxxtentacion", "giri nandini",
    "zahra", "jonome", "jibon", "one shot", "zone", "dropshipping",
)


def suggest(stem):
    url = (
        "https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q="
        + urllib.parse.quote(stem)
    )
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as response:
        payload = json.loads(response.read().decode())
    return list(payload[1])


def words(text):
    return re.findall(r"[a-z0-9]+", text.lower())


def content_key(text):
    return tuple(w for w in words(text) if w not in GENERIC and w not in LANG and len(w) > 2)


def dropped(text):
    hay = text.lower()
    return any(bit in hay for bit in DROP)


def says_ai(title):
    return re.search(r"\bai\b", title.lower()) is not None


def search_top(query):
    wanted = content_key(query)
    cmd = [
        "yt-dlp", "--flat-playlist", "--playlist-end", "8",
        "--print", "%(view_count)s\t%(title)s",
        "ytsearch8:" + query,
    ]
    out = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=90)
    matched = []
    for line in out.stdout.splitlines():
        views, _, title = line.partition("\t")
        try:
            nviews = int(views)
        except ValueError:
            continue
        title = title.strip()
        if not title or dropped(title):
            continue
        hay = title.lower()
        if wanted and not any(re.search(r"\b" + re.escape(word) + r"\b", hay) for word in wanted):
            continue
        matched.append((nviews, title))
    with_ai = [row for row in matched if says_ai(row[1])]
    if not with_ai:
        return None
    return max(with_ai)


def match_recipe(text, recipes):
    hay = text.lower()
    for recipe in recipes:
        if any(word in hay for word in recipe["words"]):
            return recipe
    return None


def collect_suggestions():
    picked = []
    seen = set()
    for letter in "abcdefghijklmnopqrstuvwxyz":
        stem = f"ai {letter}"
        try:
            items = suggest(stem)
        except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
            print(f"suggest skip {stem}: {exc}", file=sys.stderr)
            time.sleep(0.3)
            continue
        kept = 0
        for item in items:
            if dropped(item):
                continue
            key = content_key(item)
            if not key or key in seen:
                continue
            seen.add(key)
            picked.append(item)
            kept += 1
            if kept >= 3:
                break
        time.sleep(0.12)
    return picked


def main():
    import urllib.error
    recipes = json.loads(RECIPES.read_text())
    queries = collect_suggestions()
    print("suggestions:", ", ".join(queries))
    rows = []
    for query in queries:
        try:
            hit = search_top(query)
        except (subprocess.SubprocessError, OSError) as exc:
            print(f"search skip {query}: {exc}", file=sys.stderr)
            continue
        if not hit:
            print(f"no video {query}")
            continue
        views, title = hit
        rows.append((views, query, title))
        print(f"{views:10} | {query} | {title[:80]}")
    rows.sort(reverse=True)
    formats = []
    recipe_seen = False
    for views, query, title in rows[:8]:
        recipe = match_recipe(query + " " + title, recipes)
        free = True
        if recipe:
            free = not recipe_seen
            recipe_seen = True
        formats.append({
            "id": "-".join(content_key(query)) or f"row-{len(formats)+1}",
            "rank": f"#{len(formats)+1}",
            "title": query,
            "kind": "suggestion",
            "signal_views": views,
            "signal_title": title,
            "examples": [title],
            "videos": 1,
            "free": free,
            "lasts": recipe["lasts"] if recipe else "It stays while people keep searching this phrase. Next scan can drop it.",
            "what": f"YouTube suggested '{query}' from the letters after 'ai'. Top public video has {views:,} views.",
            "make": recipe["make"] if recipe else [],
            "tools": recipe["tools"] if recipe else "",
            "avoid": recipe["avoid"] if recipe else "",
        })
    doc = {
        "updated": date.today().isoformat(),
        "source": (
            "YouTube's own suggestions for 'ai' plus each letter. "
            "No format name is typed in. Suggestions that are tutorials or tools are dropped, "
            "then the rest are ranked by the top video's views."
        ),
        "formats": formats,
    }
    DATA.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {len(formats)}")


if __name__ == "__main__":
    main()
