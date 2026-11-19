#!/bin/zsh
# Swap the home page hero video (e.g. the Pouya film).
#   tools/set-hero.sh ~/Downloads/pouya.mp4            # vertical 9:16 source (a reel)
#   tools/set-hero.sh ~/Downloads/pouya.mp4 0.4        # optional: where the desktop crop sits, 0 = top, 0.5 = middle, 1 = bottom
# Makes media/hero-wide.mp4 (3:2 crop for desktop), media/hero-tall.mp4 (full vertical for phones and the 9:16 frame)
# and matching poster JPGs. Both videos are silent loops; the page keeps the same file names, so nothing else changes.
set -e
cd "${0:A:h}/.."
SRC="$1"; Y="${2:-0.45}"; AT="${3:-3}"
[[ -f "$SRC" ]] || { echo "Usage: tools/set-hero.sh path/to/video.mp4 [crop 0-1] [poster second]"; exit 1; }
E=(-movflags +faststart -pix_fmt yuv420p -an -c:v libx264 -preset slow)
# desktop: full width, a 3:2 band taken from the chosen height
WIDE="crop=iw:'min(ih,iw*2/3)':0:'(ih-min(ih,iw*2/3))*$Y',scale='min(1600,iw)':-2"
ffmpeg -nostdin -loglevel error -y -i "$SRC" -vf "$WIDE" -crf 25 $E media/hero-wide.mp4
ffmpeg -nostdin -loglevel error -y -i "$SRC" -vf "scale=720:-2" -crf 27 $E media/hero-tall.mp4
ffmpeg -nostdin -loglevel error -y -ss "$AT" -i "$SRC" -frames:v 1 -vf "$WIDE" -q:v 4 media/hero-wide.jpg
ffmpeg -nostdin -loglevel error -y -ss "$AT" -i "$SRC" -frames:v 1 -vf "scale=720:-2" -q:v 4 media/hero-tall.jpg
du -h media/hero-*
echo "Hero updated. Check the desktop crop on the home page; re-run with a different crop value if a face is cut off."
