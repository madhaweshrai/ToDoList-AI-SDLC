#!/usr/bin/env bash
# Builds dist/todolist-<version>.zip. Set SKIP_TESTS=1 to skip the test run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
NAME="todolist-${VERSION}"
DIST="$ROOT/dist"
STAGE="$DIST/$NAME"
ARCHIVE="$DIST/$NAME.zip"

if [ "${SKIP_TESTS:-0}" != "1" ]; then
  echo "==> Running tests (with the coverage gate)"
  npm run test:coverage
fi

echo "==> Staging $NAME"
rm -rf "$STAGE" "$ARCHIVE"
mkdir -p "$STAGE"

cp -R backend db CSS JS assets "$STAGE/"
cp index.html package.json package-lock.json Dockerfile docker-compose.yml .dockerignore README.md LICENSE "$STAGE/"

echo "==> Creating $ARCHIVE"
if command -v zip >/dev/null 2>&1; then
  (cd "$DIST" && zip -r -q "$NAME.zip" "$NAME")
elif command -v python3 >/dev/null 2>&1 && python3 -c "import zipfile" >/dev/null 2>&1; then
  (cd "$DIST" && python3 - "$NAME" <<'PY'
import os, sys, zipfile
name = sys.argv[1]
with zipfile.ZipFile(name + ".zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for folder, _, files in os.walk(name):
        for file in files:
            path = os.path.join(folder, file)
            archive.write(path, path.replace(os.sep, "/"))
PY
  )
else
  echo "error: neither 'zip' nor 'python3' is available to create the archive" >&2
  exit 1
fi

rm -rf "$STAGE"
echo "==> Built $ARCHIVE"
