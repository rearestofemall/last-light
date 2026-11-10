#!/usr/bin/env bash
# Builds the Windows desktop version: release/TheLastLight.exe
# Needs Node (for the web build) and Go 1.22+ (cross-compiles; no Windows machine required).
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build
rm -rf desktop/dist
mkdir -p desktop/dist release
cp -r dist/. desktop/dist/
find desktop/dist -name '*.map' -delete

cd desktop
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w" -o ../release/TheLastLight.exe .
cd ..
ls -l release/TheLastLight.exe
