#!/usr/bin/env bash
set -euo pipefail

REPO_TARBALL_URL="${AGENTPASSPORTS_TARBALL_URL:-https://github.com/sarvesh1327/agentpassports.eth/archive/refs/heads/main.tar.gz}"
INSTALL_ROOT="${AGENTPASSPORTS_HOME:-$HOME/.agentpassports}"
SKILL_DIR="$INSTALL_ROOT/skill"
RUNTIME_DIR="$INSTALL_ROOT/runtime"
BIN_DIR="$INSTALL_ROOT/bin"
CREATE_KEY=false
SKIP_DEPS=false

usage() {
  cat <<'EOF'
AgentPassports Skill Pack installer

Usage:
  curl -fsSL https://agentpassports.eth/install | bash
  curl -fsSL https://agentpassports.eth/install | bash -s -- --create-key

Options:
  --create-key   Generate a local agent signer after installing.
  --skip-deps    Skip npm dependency install for tsx/viem.
  --help         Show this help.

Security:
  - Installs skills/scripts locally under ~/.agentpassports/.
  - Does not read or write .env files.
  - Does not create or overwrite a private key unless --create-key is passed.
  - Generated keys stay in the current directory at .agentPassports/keys.txt.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --create-key)
      CREATE_KEY=true
      shift
      ;;
    --skip-deps)
      SKIP_DEPS=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

need_command curl
need_command tar
if [[ "$SKIP_DEPS" != "true" ]]; then
  need_command npm
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

ARCHIVE="$TMP_DIR/agentpassports.tar.gz"
echo "Downloading AgentPassports Skill Pack..."
curl -fsSL "$REPO_TARBALL_URL" -o "$ARCHIVE"
tar -xzf "$ARCHIVE" -C "$TMP_DIR"
SRC_DIR="$(find "$TMP_DIR" -maxdepth 1 -type d -name 'agentpassports.eth-*' -print -quit)"
if [[ -z "$SRC_DIR" || ! -d "$SRC_DIR/skills/agentpassports" ]]; then
  echo "Could not find skills/agentpassports in downloaded archive." >&2
  exit 1
fi

mkdir -p "$SKILL_DIR" "$RUNTIME_DIR" "$BIN_DIR"
rm -rf "$SKILL_DIR"
mkdir -p "$SKILL_DIR"
cp -R "$SRC_DIR/skills/agentpassports/." "$SKILL_DIR/"

cat > "$RUNTIME_DIR/package.json" <<'JSON'
{"private":true,"dependencies":{"tsx":"^4.19.0","viem":"^2.21.0"}}
JSON

if [[ "$SKIP_DEPS" != "true" ]]; then
  echo "Installing local TypeScript signing dependencies..."
  (cd "$RUNTIME_DIR" && npm install --silent --no-audit --no-fund)
  rm -rf "$SKILL_DIR/node_modules"
  ln -s "$RUNTIME_DIR/node_modules" "$SKILL_DIR/node_modules"
fi

cat > "$BIN_DIR/agentpassports-create-key" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
AGENTPASSPORTS_HOME="${AGENTPASSPORTS_HOME:-$HOME/.agentpassports}"
exec "$AGENTPASSPORTS_HOME/runtime/node_modules/.bin/tsx" "$AGENTPASSPORTS_HOME/skill/create-key.ts" "$@"
EOF

cat > "$BIN_DIR/agentpassports-sign-intent" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
AGENTPASSPORTS_HOME="${AGENTPASSPORTS_HOME:-$HOME/.agentpassports}"
exec "$AGENTPASSPORTS_HOME/runtime/node_modules/.bin/tsx" "$AGENTPASSPORTS_HOME/skill/sign-intent.ts" "$@"
EOF

chmod +x "$BIN_DIR/agentpassports-create-key" "$BIN_DIR/agentpassports-sign-intent"

if [[ -d "$HOME/.hermes" || -n "$(command -v hermes || true)" ]]; then
  HERMES_SKILL_DIR="$HOME/.hermes/skills/agentpassports"
  mkdir -p "$HERMES_SKILL_DIR"
  cp -R "$SKILL_DIR/." "$HERMES_SKILL_DIR/"
  rm -rf "$HERMES_SKILL_DIR/node_modules"
fi

cat <<EOF

AgentPassports Skill Pack installed.

Installed files:
  Skill:   $SKILL_DIR
  Scripts: $BIN_DIR/agentpassports-create-key
           $BIN_DIR/agentpassports-sign-intent

Add this to PATH if needed:
  export PATH="$BIN_DIR:\$PATH"

Next steps:
  1. agentpassports-create-key
  2. Register the printed public signer at https://agentpassports.eth/register
  3. Ask the agent to read $SKILL_DIR/SKILL.md
  4. Use MCP: build_task_intent -> local sign -> submit_task -> check_task_status

Safety:
  - Installer never touches env files.
  - Private key stays local in .agentPassports/keys.txt.
  - MCP never receives private keys.
  - KeeperHub validates Passport/Visa state and stamps the result.
EOF

if [[ "$CREATE_KEY" == "true" ]]; then
  echo
  echo "Creating local agent signer in the current directory..."
  "$BIN_DIR/agentpassports-create-key"
fi
