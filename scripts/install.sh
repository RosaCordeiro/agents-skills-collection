#!/usr/bin/env bash
# Instala agents, skills e rules do cursor-kit no Cursor do usuario.
# Uso: bash scripts/install.sh [--force]
set -euo pipefail

FORCE=0
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

detect_cursor_home() {
  if [[ -n "${CURSOR_HOME:-}" ]]; then
    printf '%s\n' "$CURSOR_HOME"
    return
  fi

  # No WSL, o Cursor do Windows le %USERPROFILE%\.cursor — nao o ~/.cursor do Linux.
  if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; then
    local win_home=""
    if command -v cmd.exe >/dev/null 2>&1; then
      win_home="$(cmd.exe /c "echo %USERPROFILE%" 2>/dev/null | tr -d '\r')"
      win_home="${win_home//\\//}"
      if [[ "$win_home" =~ ^[A-Za-z]: ]]; then
        local drive="${win_home:0:1}"
        drive="$(printf '%s' "$drive" | tr '[:upper:]' '[:lower:]')"
        win_home="/mnt/${drive}${win_home:2}"
      fi
    fi
    if [[ -n "$win_home" && -d "$win_home" ]]; then
      printf '%s\n' "$win_home/.cursor"
      return
    fi
  fi

  printf '%s\n' "${HOME}/.cursor"
}

CURSOR_DIR="$(detect_cursor_home)"
echo "Destino: $CURSOR_DIR"

mkdir -p "$CURSOR_DIR/agents" "$CURSOR_DIR/skills" "$CURSOR_DIR/rules"

sync_dir() {
  local src="$1"
  local dest="$2"
  local name="$3"

  if [[ ! -d "$src" ]]; then
    echo "Pulando $name (origem ausente): $src"
    return
  fi

  if command -v rsync >/dev/null 2>&1; then
    if [[ "$FORCE" -eq 1 ]]; then
      rsync -a --delete "$src/" "$dest/"
    else
      rsync -a "$src/" "$dest/"
    fi
  else
    cp -a "$src"/. "$dest"/
  fi
  echo "OK  $name → $dest"
}

sync_dir "$ROOT/agents" "$CURSOR_DIR/agents" "agents"
sync_dir "$ROOT/skills" "$CURSOR_DIR/skills" "skills"
sync_dir "$ROOT/rules" "$CURSOR_DIR/rules" "rules"

echo
echo "Instalacao concluida."
echo "Abra um chat novo no Cursor (ou reinicie) para carregar agents/skills/rules."
echo
echo "Nao altera skills-cursor/ (skills nativas do Cursor)."
