#!/usr/bin/env python3
"""Weekly scan. Two outputs.

data/live.json  For every niche in the catalog, the five most-viewed videos
                that YouTube lists for that niche's search phrase among videos
                uploaded this week. Views, length, channel, link. One point per
                week is kept so the page can draw a trend line.
data/radar.json Phrases YouTube itself suggests after "ai" plus each letter,
                with this week's top video for each. No phrase is typed in.
                Anything already in the catalog is skipped.
"""
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "catalog.json"
LIVE = ROOT / "data" / "live.json"
RADAR = ROOT / "data" / "radar.json"

# sp= is YouTube's own filter token: sort by view count, uploaded this week, videos only
THIS_WEEK = "CAMSBAgDEAE%3D"

GENERIC = {"ai", "video", "videos", "short", "shorts", "viral", "youtube", "wala", "wali"}
LANG = {"hindi", "english", "tamil", "malayalam", "chinese", "odia", "nepali", "full"}
DROP = (
    "kaise", "how to", "how i", "course", "tutorial", "generator", "roadmap",
    "prompt", "tools", "tool ", "editing", "editor", "monetization", "jobs",
    "job ", "review", "news", "photo", "image", "website", "glasses",
    "smartphone", "quiz", "question", "explained", "basics", "kya hai",
    "kya hota", "matlab", "use kare", "sikhe", "updates", "full movie",
    "workflow", "app", "unit ", "link", "channel kaise", "song", "songs",
    "remix", "bhajan", "phone", "nova", "engineer", "bubble", "interview",
    "robot", "agents", "masterclass", "quantum", "ugc", "youtube", "data center",
    "qawwali", "one shot", "zone", "dropshipping", "official", "technology",
    "trending", "new trend", "generated video", "world", "class", "course",
    "logo", "ofm", "cover", "version", "gemini", "claude", "use", "uncensored",
    "quest", "que ", "fiesta", "uncovered", "rhymes", "kamal", "dehar",
)


def words(text):
    return re.findall(r"[a-z0-9]+", text.lower())


def content_key(text):
    return tuple(w for w in words(text) if w not in GENERIC and w not in LANG and len(w) > 2)


def dropped(text):
    hay = text.lower()
    return any(bit in hay for bit in DROP)


def search_week(query, count=5):
    url = "https://www.youtube.com/results?search_query=" + urllib.parse.quote_plus(query) + "&sp=" + THIS_WEEK
    cmd = ["yt-dlp", "--flat-playlist", "--playlist-end", str(count), "-J", url]
    for attempt in range(3):
        try:
            out = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=90)
            data = json.loads(out.stdout)
            break
        except (subprocess.SubprocessError, OSError, json.JSONDecodeError) as exc:
            if attempt == 2:
                print(f"search skip {query}: {exc}", file=sys.stderr)
                return None
            time.sleep(2 + attempt * 3)
    rows = []
    for entry in data.get("entries") or []:
        views = entry.get("view_count")
        if views is None:
            continue
        rows.append({
            "title": (entry.get("title") or "").strip(),
            "views": int(views),
            "secs": int(entry.get("duration") or 0),
            "channel": entry.get("channel") or entry.get("uploader") or "",
            "url": entry.get("url") or "",
        })
    rows.sort(key=lambda r: r["views"], reverse=True)
    return rows


def scan_niche(niche):
    rows = search_week(niche["q"])
    time.sleep(0.4)
    return niche["id"], rows


def load_history():
    if not LIVE.exists():
        return {}
    try:
        old = json.loads(LIVE.read_text())
    except json.JSONDecodeError:
        return {}
    return {k: v.get("history", []) for k, v in old.get("niches", {}).items()}


def suggest(stem):
    url = "https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=" + urllib.parse.quote(stem)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as response:
        return list(json.loads(response.read().decode())[1])


def radar(catalog_words):
    picked, seen = [], set()
    for letter in "abcdefghijklmnopqrstuvwxyz":
        try:
            items = suggest(f"ai {letter}")
        except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
            print(f"suggest skip {letter}: {exc}", file=sys.stderr)
            continue
        kept = 0
        for item in items:
            key = content_key(item)
            if dropped(item) or not key or key in seen:
                continue
            if all(k in catalog_words for k in key):
                continue
            seen.add(key)
            picked.append(item)
            kept += 1
            if kept >= 3:
                break
        time.sleep(0.15)
    out, used = [], set()
    for phrase in picked:
        rows = search_week(phrase, 6)
        time.sleep(0.4)
        for row in rows or []:
            title = row["title"].lower()
            says_ai = re.search(r"\bai\b|#ai|ai[- ]generated", title) is not None
            on_topic = any(re.search(r"\b" + re.escape(w) + r"\b", title) for w in content_key(phrase))
            if says_ai and on_topic and not dropped(row["title"]) and row["views"] >= 100000 and row["url"] not in used:
                used.add(row["url"])
                out.append({"phrase": phrase, **row})
                break
    out.sort(key=lambda r: r["views"], reverse=True)
    return out[:16]


def main():
    cat = json.loads(CATALOG.read_text())
    history = load_history()
    today = date.today().isoformat()
    if "--radar-only" in sys.argv:
        catalog_words = set()
        for n in cat["niches"]:
            catalog_words.update(content_key(n["name"]))
            catalog_words.update(content_key(n["q"]))
        found = radar(catalog_words)
        RADAR.write_text(json.dumps({"updated": today, "items": found}, indent=1, ensure_ascii=False) + "\n")
        print(f"radar: {len(found)} phrases")
        return
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(scan_niche, cat["niches"]))
    niches = {}
    for nid, rows in results:
        if rows is None:
            old = history.get(nid, [])
            niches[nid] = {"top": [], "history": old, "ok": False}
            continue
        hist = [h for h in history.get(nid, []) if h["date"] != today]
        if rows:
            hist.append({"date": today, "views": rows[0]["views"]})
        niches[nid] = {
            "top": rows[:3],
            "medianSecs": int(median([r["secs"] for r in rows if r["secs"]])) if any(r["secs"] for r in rows) else 0,
            "history": hist[-12:],
            "ok": True,
        }
    LIVE.write_text(json.dumps({"updated": today, "niches": niches}, indent=1, ensure_ascii=False) + "\n")
    ok = sum(1 for v in niches.values() if v["ok"] and v["top"])
    print(f"live: {ok} of {len(niches)} niches have a top video this week")

    catalog_words = set()
    for n in cat["niches"]:
        catalog_words.update(content_key(n["name"]))
        catalog_words.update(content_key(n["q"]))
    found = radar(catalog_words)
    RADAR.write_text(json.dumps({"updated": today, "items": found}, indent=1, ensure_ascii=False) + "\n")
    print(f"radar: {len(found)} phrases")
    if ok == 0:
        sys.exit("no niche returned a video; leaving the run failed so the workflow does not commit an empty week")


if __name__ == "__main__":
    main()
