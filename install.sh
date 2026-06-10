#!/usr/bin/env bash
set -euo pipefail

REPO="${SIGIL_REPO:-ethan-huo/sigil}"
VERSION="${SIGIL_VERSION:-latest}"
BIN_DIR="${SIGIL_INSTALL_DIR:-$HOME/.local/bin}"

usage() {
  cat <<'USAGE'
Usage: install.sh [--dir DIR] [--version VERSION] [--repo OWNER/REPO]

Download and install the sigil executable JS bundle from GitHub Releases.
Requires the Bun runtime (https://bun.sh) on PATH.

Options:
  --dir DIR          Install directory. Default: $SIGIL_INSTALL_DIR or ~/.local/bin.
  --version VERSION  Release version or tag. Default: $SIGIL_VERSION or latest.
  --repo OWNER/REPO  GitHub repository. Default: $SIGIL_REPO or ethan-huo/sigil.
  -h, --help         Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --dir" >&2
        exit 1
      fi
      BIN_DIR="$2"
      shift 2
      ;;
    --version)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --version" >&2
        exit 1
      fi
      VERSION="$2"
      shift 2
      ;;
    --repo)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --repo" >&2
        exit 1
      fi
      REPO="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to install sigil." >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "sigil runs on the Bun runtime, which was not found on PATH." >&2
  echo "Install it from https://bun.sh and re-run this script." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required at runtime to vendor icon libraries; install it before using sigil." >&2
fi

if [[ "$VERSION" == "latest" ]]; then
  URL="https://github.com/$REPO/releases/latest/download/sigil"
else
  URL="https://github.com/$REPO/releases/download/$VERSION/sigil"
fi

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

echo "Downloading sigil from $URL"
curl -fsSL "$URL" -o "$TMP_FILE"

mkdir -p "$BIN_DIR"
cp "$TMP_FILE" "$BIN_DIR/sigil"
chmod +x "$BIN_DIR/sigil"

echo "Installed sigil to $BIN_DIR/sigil"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "Add $BIN_DIR to PATH before running sigil directly." ;;
esac
