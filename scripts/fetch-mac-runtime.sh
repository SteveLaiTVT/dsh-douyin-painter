#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
painter_download_dir=$(mktemp -d "${TMPDIR:-/tmp}/painter-node24.XXXXXX")
trap 'rm -rf -- "$painter_download_dir"' EXIT

for painter_base in https://mirrors.cloud.tencent.com/nodejs-release https://nodejs.org/dist; do
  painter_url="$painter_base/latest-v24.x"
  printf 'Downloading official Node 24 metadata from %s\n' "$painter_url"
  if ! curl -fsSL --connect-timeout 10 --max-time 30 "$painter_url/SHASUMS256.txt" -o "$painter_download_dir/SHASUMS256.txt"; then
    continue
  fi
  painter_archive=$(awk '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-darwin-arm64\.tar\.xz$/ { print $2; exit }' "$painter_download_dir/SHASUMS256.txt")
  if [[ -z "$painter_archive" ]]; then continue; fi
  painter_expected=$(awk -v archive="$painter_archive" '$2 == archive { print $1; exit }' "$painter_download_dir/SHASUMS256.txt")
  if [[ ! "$painter_expected" =~ ^[a-f0-9]{64}$ ]]; then continue; fi
  if ! curl -fSL --connect-timeout 10 --max-time 180 "$painter_url/$painter_archive" -o "$painter_download_dir/$painter_archive"; then
    continue
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    painter_actual=$(sha256sum "$painter_download_dir/$painter_archive" | awk '{print $1}')
  else
    painter_actual=$(shasum -a 256 "$painter_download_dir/$painter_archive" | awk '{print $1}')
  fi
  if [[ "$painter_actual" != "$painter_expected" ]]; then
    printf 'Archive checksum mismatch; refusing this download.\n' >&2
    continue
  fi
  painter_dist=${painter_archive%.tar.xz}
  tar -xJf "$painter_download_dir/$painter_archive" -C "$painter_download_dir" "$painter_dist/bin/node" "$painter_dist/LICENSE"
  painter_kind=$(file "$painter_download_dir/$painter_dist/bin/node")
  if [[ "$painter_kind" != *Mach-O* || "$painter_kind" != *arm64* ]]; then
    printf 'Expected Mach-O arm64, got %s\n' "$painter_kind" >&2
    exit 1
  fi
  mkdir -p runtime
  install -m 755 "$painter_download_dir/$painter_dist/bin/node" runtime/node
  install -m 644 "$painter_download_dir/$painter_dist/LICENSE" runtime/NODE-LICENSE.txt
  printf 'Source: %s/%s\nArchive SHA256: %s\nType: %s\n' "$painter_url" "$painter_archive" "$painter_actual" "$painter_kind" > runtime/NODE-SOURCE.txt
  file runtime/node
  printf 'Installed official macOS arm64 Node runtime. Linux execution is not attempted.\n'
  exit 0
done

printf 'Unable to download Node 24 darwin-arm64 from either official source/mirror. No placeholder binary was installed.\n' >&2
exit 1
