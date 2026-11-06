#!/usr/bin/env python3
"""Build from an explicit allowlist; never include settings, tests, docs or git."""
import argparse
import hashlib
import json
from pathlib import Path
import stat
import struct
import zipfile

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("--allow-system-node", action="store_true", help="explicitly build a non-self-contained fallback ZIP")
parser.add_argument("--output", type=Path, default=ROOT / "delivery/danmu-painter-mac.zip")
args = parser.parse_args()
node = ROOT / "runtime/node"
bundled = node.is_file() and not node.is_symlink()
if bundled:
    with node.open("rb") as f:
        header = f.read(8)
    if len(header) != 8 or struct.unpack("<II", header) != (0xFEEDFACF, 0x0100000C):
        raise SystemExit("runtime/node must be a Mach-O 64-bit arm64 executable")
    if not node.stat().st_mode & stat.S_IXUSR:
        raise SystemExit("runtime/node must be executable")
    if not (ROOT / "runtime/NODE-SOURCE.txt").is_file() or not (ROOT / "runtime/NODE-LICENSE.txt").is_file():
        raise SystemExit("official runtime source/checksum and license are required")
elif not args.allow_system_node:
    raise SystemExit("runtime/node missing: self-contained build refused. Fetch the official runtime first; --allow-system-node explicitly emits a marked fallback.")

files = [ROOT / f for f in ["server.js", "index.js", "cordis.patch.yml", "package.json", "package-lock.json", "启动.command", "README-BOSS.md"]]
excluded = {"test", "tests", "docs", "delivery", "data", ".git", ".superpowers", "__pycache__"}
for directory in ["lib", "standalone", "public", "node_modules", "runtime"]:
    base = ROOT / directory
    if not base.is_dir():
        raise SystemExit(f"required package directory missing: {directory}")
    for path in sorted(base.rglob("*")):
        parts = path.relative_to(base).parts
        if any(p in excluded or p.startswith(".") for p in parts):
            continue
        if path.is_symlink():
            raise SystemExit(f"package symlink refused: {path.relative_to(ROOT)}")
        if path.is_file():
            if path.suffix == ".node" and directory == "node_modules":
                raise SystemExit("native dependency found; dependencies must be pure JavaScript")
            files.append(path)

for path in files:
    if not path.is_file():
        raise SystemExit(f"required package file missing: {path.relative_to(ROOT)}")
manifest = {"selfContained": bundled, "platform": "macOS arm64", "requiredNode": "24 (system fallback minimum 22)", "macFirstLaunchVerified": False, "files": {}}
args.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(set(files)):
        relative = path.relative_to(ROOT).as_posix()
        archive.write(path, f"danmu-painter-mac/{relative}")
        manifest["files"][relative] = hashlib.sha256(path.read_bytes()).hexdigest()
    archive.writestr("danmu-painter-mac/BUILD-INFO.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    if not bundled:
        archive.writestr("danmu-painter-mac/RUNTIME-MISSING.txt", "本包未包含 runtime/node：沙箱无法下载官方 Node 24 darwin-arm64。\n需要 Mac 已安装 Node 24 后才能双击运行；不属于自带运行时的完整成品包。\n没有放入占位程序或 Linux 二进制。\n")
digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
args.output.with_suffix(args.output.suffix + ".sha256").write_text(f"{digest}  {args.output.name}\n")
print(json.dumps({"zip": str(args.output), "bytes": args.output.stat().st_size, "sha256": digest, "selfContained": bundled}, ensure_ascii=False))
