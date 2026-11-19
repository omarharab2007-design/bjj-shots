#!/bin/zsh
# Publish the site to GitHub Pages: copies the site files into deploy/ (the git clone of omarharab2007-design/bjj-shots),
# commits and pushes. Pages redeploys in about a minute.
#   tools/publish.sh "Add AJP Abu Dhabi gallery"
set -e
cd "${0:A:h}/.."
MSG="${1:-Update site}"
[[ -d deploy/.git ]] || { echo "deploy/ is not a git clone. See GUIDE.md."; exit 1; }
rsync -a --delete \
  --exclude '.git' --exclude '.nojekyll' --exclude '.github' \
  --exclude 'deploy' --exclude 'raw' --exclude 'urls.txt' --exclude 'encode.sh' \
  --exclude 'tools/originals' --exclude 'GUIDE.md' --exclude '.DS_Store' \
  ./ deploy/
cd deploy
git add -A
if git diff --cached --quiet; then echo "Nothing changed."; exit 0; fi
git commit -q -m "$MSG"
git push -q
echo "Pushed: $MSG"
echo "Live in ~1 min: https://omarharab2007-design.github.io/bjj-shots/"
