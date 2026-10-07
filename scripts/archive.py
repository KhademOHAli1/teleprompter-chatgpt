#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Deterministic source-only release. Never walks dependency or private directories."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parent.parent
TOP = [
    "package.json", "bun.lock", "bunfig.toml", "tsconfig.json", "plugin.json",
    "mcp.json", ".env.example", ".gitignore", ".gitattributes", "start.command",
    "LICENSE", "README.md", "README.de.md", "CONTRIBUTING.md", "SECURITY.md",
    "CHANGELOG.md",
]
DIRECTORIES = ["src", "tests", "scripts", "docs", "skills", ".github", ".agents"]
EXTENSIONS = {".ts", ".html", ".css", ".py", ".md", ".json", ".yml"}

def source_files():
    files = [ROOT / name for name in TOP]
    for directory in DIRECTORIES:
        files.extend(p for p in (ROOT / directory).rglob("*") if p.is_file() and p.suffix in EXTENSIONS and "__pycache__" not in p.parts)
    return sorted(files, key=lambda p: p.relative_to(ROOT).as_posix())

def check(files):
    for p in files:
        if p.is_symlink() or not p.is_file():
            raise ValueError("Missing or symlinked source: " + str(p.relative_to(ROOT)))
        text = p.read_text(encoding="utf-8")
        private_home = "/" + "Users" + "/"
        private_pem = r"-----BEGIN .*" + "PRIVATE" + " KEY" + "-----"
        if re.search(re.escape(private_home) + r"|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|" + private_pem, text):
            raise ValueError("Potential private value in " + str(p.relative_to(ROOT)))
    for name in ["package.json", "plugin.json"]:
        if json.loads((ROOT / name).read_text())["license"] != "MIT":
            raise ValueError("MIT license declaration missing")
    if not (ROOT / "start.command").stat().st_mode & 0o111:
        raise ValueError("start.command is not executable")

def main():
    files = source_files()
    check(files)
    version = json.loads((ROOT / "package.json").read_text())["version"]
    destination = ROOT.parent / ("teleprompter-chatgpt-source-v" + version + ".zip")
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for p in files:
            relative = p.relative_to(ROOT).as_posix()
            info = zipfile.ZipInfo("teleprompter-chatgpt/" + relative, (2026, 10, 7, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100755 if relative == "start.command" else 0o100644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, p.read_bytes())
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    destination.with_suffix(".sha256").write_text(digest + "  " + destination.name + "\n")
    print("Packaged " + str(len(files)) + " source files: " + destination.name)

if __name__ == "__main__":
    main()
