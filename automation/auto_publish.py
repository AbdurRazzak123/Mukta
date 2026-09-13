#!/usr/bin/env python3
"""BanglaSongbad automatic social publisher.

Safe-by-default:
- Existing pages listed in social-publish-state.json are not published again.
- Missing API configuration is recorded as not_configured and retried later.
- Each platform is independent; one failure does not block the others.
- Secrets are read only from environment variables / GitHub Actions secrets.
"""
from __future__ import annotations
import base64, json, os, re, sys, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
NEWS_DIR = ROOT / "news"
STATE_FILE = ROOT / "social-publish-state.json"
LOG_DIR = ROOT / "automation" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
PUBLISH_LOG_FILE = ROOT / "social-publish-log.json"

SITE_BASE = os.getenv("SITE_BASE_URL", "https://abdurrazzak123.github.io/Banglasangbad/").rstrip("/") + "/"
META_VERSION = os.getenv("META_GRAPH_VERSION", "v24.0")
DRY_RUN = os.getenv("SOCIAL_DRY_RUN", "false").lower() in {"1", "true", "yes"}
PUBLISH_EXISTING = os.getenv("PUBLISH_EXISTING", "false").lower() in {"1", "true", "yes"}


def now():
    return datetime.now(timezone.utc).isoformat()


def load_state():
    if not STATE_FILE.exists():
        return {"version": 1, "initialized_at": now(), "articles": {}}
    return json.loads(STATE_FILE.read_text(encoding="utf-8"))


def save_state(state):
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(STATE_FILE)
    log = {"generated_at": now(), "articles": state.get("articles", {})}
    PUBLISH_LOG_FILE.write_text(json.dumps(log, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def html_meta(path):
    text = path.read_text(encoding="utf-8", errors="ignore")
    def meta(name):
        m = re.search(r'<meta[^>]+(?:property|name)=["\']' + re.escape(name) + r'["\'][^>]+content=["\']([^"\']*)', text, re.I)
        if not m:
            m = re.search(r'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + re.escape(name) + r'["\']', text, re.I)
        return m.group(1).strip() if m else ""
    title = meta("og:title") or (re.search(r"<title[^>]*>(.*?)</title>", text, re.I|re.S) or [None, path.stem])[1].strip()
    description = meta("og:description") or meta("description")
    image = meta("og:image")
    canonical_m = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)', text, re.I)
    canonical = canonical_m.group(1).strip() if canonical_m else SITE_BASE + "news/" + path.stem + ".html"
    image = urljoin(canonical, image) if image else ""
    return {"id": path.stem, "title": re.sub(r"\s+", " ", title), "description": re.sub(r"\s+", " ", description), "url": canonical, "image": image}


def requests_session():
    try:
        import requests
        return requests.Session()
    except ImportError:
        print("requests package is required", file=sys.stderr)
        raise


def post_facebook(article, s):
    token = os.getenv("META_PAGE_ACCESS_TOKEN", "").strip()
    page_id = os.getenv("META_PAGE_ID", "").strip()
    if not token or not page_id:
        return {"status": "not_configured", "detail": "META_PAGE_ACCESS_TOKEN / META_PAGE_ID missing"}
    caption = f"{article['title']}\n\n{article['url']}"
    if DRY_RUN:
        return {"status": "dry_run", "detail": "Facebook Page post prepared"}
    r = s.post(f"https://graph.facebook.com/{META_VERSION}/{page_id}/feed", data={"message": caption, "link": article["url"], "access_token": token}, timeout=30)
    if r.ok:
        return {"status": "posted", "remote_id": r.json().get("id", "")}
    return {"status": "error", "detail": f"HTTP {r.status_code}: {r.text[:500]}"}


def post_instagram(article, s):
    token = os.getenv("META_PAGE_ACCESS_TOKEN", "").strip()
    ig_id = os.getenv("INSTAGRAM_BUSINESS_ACCOUNT_ID", "").strip()
    if not token or not ig_id:
        return {"status": "not_configured", "detail": "META_PAGE_ACCESS_TOKEN / INSTAGRAM_BUSINESS_ACCOUNT_ID missing"}
    if not article["image"]:
        return {"status": "error", "detail": "No public featured image URL found"}
    caption = f"{article['title']}\n\nআরও পড়ুন: {article['url']}"
    if DRY_RUN:
        return {"status": "dry_run", "detail": "Instagram image post prepared"}
    base = f"https://graph.facebook.com/{META_VERSION}/{ig_id}"
    r1 = s.post(f"{base}/media", data={"image_url": article["image"], "caption": caption, "access_token": token}, timeout=30)
    if not r1.ok:
        return {"status": "error", "detail": f"container HTTP {r1.status_code}: {r1.text[:500]}"}
    cid = r1.json().get("id")
    if not cid:
        return {"status": "error", "detail": "Instagram container id missing"}
    for _ in range(6):
        time.sleep(3)
        chk = s.get(f"https://graph.facebook.com/{META_VERSION}/{cid}", params={"fields":"status_code", "access_token":token}, timeout=30)
        if chk.ok and chk.json().get("status_code") in (None, "FINISHED"):
            break
    r2 = s.post(f"{base}/media_publish", data={"creation_id": cid, "access_token": token}, timeout=30)
    if r2.ok:
        return {"status": "posted", "remote_id": r2.json().get("id", "")}
    return {"status": "error", "detail": f"publish HTTP {r2.status_code}: {r2.text[:500]}"}


def post_x(article, s):
    token = os.getenv("X_ACCESS_TOKEN", "").strip()
    if not token:
        return {"status": "not_configured", "detail": "X_ACCESS_TOKEN missing"}
    text = f"{article['title']}\n{article['url']}"
    if len(text) > 280:
        text = article["title"][: max(1, 280 - len(article["url"]) - 2)].rstrip() + "…\n" + article["url"]
    if DRY_RUN:
        return {"status": "dry_run", "detail": "X post prepared"}
    r = s.post("https://api.x.com/2/tweets", headers={"Authorization": f"Bearer {token}", "Content-Type":"application/json"}, json={"text": text}, timeout=30)
    if r.ok:
        return {"status": "posted", "remote_id": (r.json().get("data") or {}).get("id", "")}
    return {"status": "error", "detail": f"HTTP {r.status_code}: {r.text[:500]}"}


def youtube_video_for(article):
    # Optional: place an MP4 at social-video/<ID>.mp4. Future video-generation can populate this folder.
    p = ROOT / "social-video" / f"{article['id']}.mp4"
    return p if p.is_file() else None


def youtube_access_token(s):
    direct = os.getenv("YOUTUBE_ACCESS_TOKEN", "").strip()
    if direct:
        return direct
    refresh = os.getenv("YOUTUBE_REFRESH_TOKEN", "").strip()
    client_id = os.getenv("YOUTUBE_CLIENT_ID", "").strip()
    client_secret = os.getenv("YOUTUBE_CLIENT_SECRET", "").strip()
    if not (refresh and client_id and client_secret):
        return ""
    try:
        r=s.post("https://oauth2.googleapis.com/token", data={
            "client_id":client_id,"client_secret":client_secret,"refresh_token":refresh,"grant_type":"refresh_token"
        }, timeout=30)
        if r.ok:
            return r.json().get("access_token", "")
    except Exception:
        pass
    return ""

def post_youtube(article, s):
    token = youtube_access_token(s)
    video = youtube_video_for(article)
    if not token:
        return {"status": "not_configured", "detail": "YOUTUBE_ACCESS_TOKEN missing"}
    if not video:
        return {"status": "waiting_for_video", "detail": f"No video file: social-video/{article['id']}.mp4"}
    if DRY_RUN:
        return {"status": "dry_run", "detail": "YouTube upload prepared"}
    # Upload through resumable multipart endpoint. Access token must come from OAuth 2.0 with youtube.upload scope.
    import requests
    metadata = {"snippet": {"title": article["title"][:100], "description": f"{article['description']}\n\n{article['url']}", "categoryId": "25"}, "status": {"privacyStatus": os.getenv("YOUTUBE_PRIVACY_STATUS", "public")}}
    init = s.post("https://www.googleapis.com/upload/youtube/v3/videos", params={"part":"snippet,status","uploadType":"resumable"}, headers={"Authorization":f"Bearer {token}","Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Type":"video/mp4","X-Upload-Content-Length":str(video.stat().st_size)}, json=metadata, timeout=30)
    if not init.ok or not init.headers.get("Location"):
        return {"status":"error","detail":f"YouTube init HTTP {init.status_code}: {init.text[:500]}"}
    with video.open("rb") as fh:
        up = s.put(init.headers["Location"], data=fh, headers={"Authorization":f"Bearer {token}","Content-Type":"video/mp4"}, timeout=300)
    if up.ok:
        return {"status":"posted", "remote_id": (up.json().get("id") if up.headers.get("content-type","").startswith("application/json") else "")}
    return {"status":"error", "detail":f"YouTube upload HTTP {up.status_code}: {up.text[:500]}"}


def bootstrap_existing(state, pages):
    if state.get("bootstrapped"):
        return False
    for p in pages:
        aid = p.stem
        state["articles"].setdefault(aid, {"initialized_at": now(), "status": "skipped_existing", "platforms": {}})
    state["bootstrapped"] = True
    state["bootstrapped_at"] = now()
    return True


def main():
    state = load_state()
    pages = sorted(NEWS_DIR.glob("*.html"), key=lambda p: int(p.stem) if p.stem.isdigit() else p.stem)
    if not pages:
        print("No news pages found")
        return 0

    changed = False
    if not PUBLISH_EXISTING:
        changed |= bootstrap_existing(state, pages)
    session = requests_session()

    for p in pages:
        aid = p.stem
        article = html_meta(p)
        rec = state["articles"].get(aid)
        if rec and rec.get("status") == "skipped_existing" and not PUBLISH_EXISTING:
            continue
        if rec is None:
            rec = {"initialized_at": now(), "status": "pending", "platforms": {}}
            state["articles"][aid] = rec
            changed = True

        platforms = rec.setdefault("platforms", {})
        handlers = [("facebook", post_facebook), ("instagram", post_instagram), ("x", post_x), ("youtube", post_youtube)]
        any_pending = False
        for name, fn in handlers:
            old = platforms.get(name, {})
            if old.get("status") in {"posted", "dry_run", "skipped_existing"}:
                continue
            result = fn(article, session)
            result["updated_at"] = now()
            platforms[name] = result
            changed = True
            if result["status"] in {"error", "not_configured", "waiting_for_video"}:
                any_pending = True
            print(f"{aid} {name}: {result['status']}")
        rec["status"] = "pending" if any_pending else "complete"
        rec["updated_at"] = now()

    if changed:
        save_state(state)
    print(f"Processed {len(pages)} news pages. Dry run={DRY_RUN}.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
