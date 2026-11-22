#!/bin/zsh
# Publish the site to GitHub Pages: copies the site files into deploy/ (the git clone of omarharab2007-design/bjj-shots),
# commits and pushes. Pages redeploys in about a minute.
#   tools/publish.sh "Add AJP Abu Dhabi gallery"
# Once the Instagram sync runs (.github/workflows/instagram.yml), GitHub owns data/highlights.json, data/instagram.json
# and media/ig/: this script pulls them down into the local copy first and never overwrites them.
set -e
cd "${0:A:h}/.."
MSG="${1:-Update site}"
[[ -d deploy/.git ]] || { echo "deploy/ is not a git clone. See GUIDE.md."; exit 1; }
git -C deploy pull -q --rebase
SYNCED=()
if grep -q '"source": "instagram"' deploy/data/highlights.json 2>/dev/null; then
  SYNCED=(--exclude 'data/highlights.json' --exclude 'data/instagram.json' --exclude 'media/ig')
  mkdir -p media/ig
  cp deploy/data/highlights.json deploy/data/instagram.json data/
  rsync -a --delete deploy/media/ig/ media/ig/
  echo "Pulled the latest Instagram sync into the local copy."
fi
rsync -a --delete \
  --exclude '.git' --exclude '.nojekyll' \
  --exclude 'deploy' --exclude 'raw' --exclude 'urls.txt' --exclude 'encode.sh' \
  --exclude 'tools/originals' --exclude 'GUIDE.md' --exclude '.DS_Store' "${SYNCED[@]}" \
  ./ deploy/
cd deploy
git add -A
if git diff --cached --quiet; then echo "Nothing changed."; exit 0; fi
git commit -q -m "$MSG"
git push -q
echo "Pushed: $MSG"
echo "Live in ~1 min: https://omarharab2007-design.github.io/bjj-shots/"
