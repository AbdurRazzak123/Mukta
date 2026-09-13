#!/usr/bin/env python3
"""Create a simple 16:9 Bangla news video from a detail-page image/title.
Requires ffmpeg. Output is intentionally local to the workflow and is not committed.
"""
from __future__ import annotations
import html, re, subprocess, sys
from pathlib import Path
from urllib.request import urlopen, Request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "social-video"
OUT.mkdir(exist_ok=True)

FONT = "/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf"
BOLD = "/usr/share/fonts/truetype/noto/NotoSansBengali-Bold.ttf"

def meta(path):
    t = path.read_text(encoding="utf-8", errors="ignore")
    m = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)', t, re.I)
    title = m.group(1) if m else path.stem
    m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', t, re.I)
    img = m.group(1) if m else ""
    m = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)', t, re.I)
    canonical = m.group(1) if m else ""
    from urllib.parse import urljoin
    return title, urljoin(canonical, img)

def main():
    ids = sys.argv[1:] or [p.stem for p in sorted((ROOT/"news").glob("*.html"))[-1:]]
    for aid in ids:
        page = ROOT / "news" / f"{aid}.html"
        if not page.exists():
            continue
        title, image_url = meta(page)
        if not image_url:
            print(f"{aid}: no image", file=sys.stderr); continue
        src = OUT / f"{aid}-src.jpg"
        src.write_bytes(urlopen(Request(image_url, headers={"User-Agent":"Mozilla/5.0"}), timeout=30).read())
        out = OUT / f"{aid}.mp4"
        # Escaped text for ffmpeg drawtext. Keep a safe subset; line wrapping is handled by the filter width.
        safe = title.replace("'", "\\'").replace(":", "\\:")
        vf = f"scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,drawtext=fontfile={BOLD}:text='{safe}':fontcolor=white:fontsize=46:box=1:boxcolor=black@0.60:boxborderw=24:x=60:y=h-180"
        cmd=["ffmpeg","-y","-loop","1","-i",str(src),"-vf",vf,"-t","12","-r","30","-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart",str(out)]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        src.unlink(missing_ok=True)
        print(out)

if __name__ == "__main__":
    main()
