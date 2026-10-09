#!/usr/bin/env bash
# Создаёт дополнительный профиль Claude Code со своей авторизацией и общей с основным ~/.claude памятью.
#
#   setup-account.sh <name>           — создать ~/.claude-<name> и команду claude-<name>
#   setup-account.sh --remove <name>  — удалить профиль (только его авторизацию; общие данные не трогаются)
#   setup-account.sh --list           — показать профили
#
# Переменные: MAIN_DIR (по умолчанию ~/.claude), BIN_DIR (по умолчанию ~/.local/bin).
set -euo pipefail

MAIN_DIR="${MAIN_DIR:-$HOME/.claude}"
MAIN_CONFIG="$HOME/.claude.json"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
MARK="# multi-account profile"

# Общее между аккаунтами: memory и транскрипты (projects), настройки, расширения, история.
SHARED=(projects settings.json CLAUDE.md skills commands agents plugins hooks output-styles keybindings.json history.jsonl file-history)

die() { echo "setup-account: $*" >&2; exit 1; }

valid_name() { [[ "$1" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || die "имя профиля: латиница в нижнем регистре, цифры, - и _ (получено '$1')"; }

email_in() {
  if command -v jq >/dev/null; then jq -r '.oauthAccount.emailAddress // "не залогинен"' "$1" 2>/dev/null || echo "не залогинен"
  else grep -o '"emailAddress": *"[^"]*"' "$1" 2>/dev/null | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || echo "?"
  fi
}

create() {
  local name="$1" dir="$HOME/.claude-$1" wrapper="$BIN_DIR/claude-$1" item
  valid_name "$name"
  [[ -d "$MAIN_DIR" ]] || die "нет $MAIN_DIR — сначала запусти claude хотя бы раз"
  [[ -n "${CLAUDE_CONFIG_DIR:-}" && "$CLAUDE_CONFIG_DIR" != "$MAIN_DIR" ]] && die "запусти из основного профиля (сейчас CLAUDE_CONFIG_DIR=$CLAUDE_CONFIG_DIR)"
  if [[ -e "$wrapper" ]] && ! grep -q "$MARK" "$wrapper"; then die "$wrapper уже существует и создан не этим скриптом"; fi

  mkdir -p "$dir" "$BIN_DIR"
  chmod 700 "$dir"

  for item in "${SHARED[@]}"; do
    [[ -e "$MAIN_DIR/$item" || -L "$MAIN_DIR/$item" ]] || continue
    if [[ -e "$dir/$item" && ! -L "$dir/$item" ]]; then
      echo "  пропуск $item: в $dir уже есть свой (не ссылка)"
      continue
    fi
    ln -sfn "$MAIN_DIR/$item" "$dir/$item"
  done

  # MCP-серверы и настройки проектов переносим, привязку к аккаунту — нет.
  if [[ ! -f "$dir/.claude.json" ]]; then
    if [[ -f "$MAIN_CONFIG" ]] && command -v jq >/dev/null; then
      jq 'del(.oauthAccount)' "$MAIN_CONFIG" > "$dir/.claude.json"
    else
      echo '{}' > "$dir/.claude.json"
    fi
    chmod 600 "$dir/.claude.json"
  fi

  cat > "$wrapper" <<EOF
#!/usr/bin/env bash
$MARK
# Claude Code под профилем '$name': своя авторизация в $dir, memory/сессии/настройки — общие с $MAIN_DIR.
export CLAUDE_CONFIG_DIR="$dir"
exec claude "\$@"
EOF
  chmod +x "$wrapper"

  echo "Профиль '$name' готов: $dir"
  echo "Команда: claude-$name   (первый запуск → /login вторым аккаунтом)"
  case ":$PATH:" in *":$BIN_DIR:"*) ;; *) echo "ВНИМАНИЕ: $BIN_DIR нет в PATH — добавь его или запускай $wrapper" ;; esac
}

remove() {
  local name="$1" dir="$HOME/.claude-$1" wrapper="$BIN_DIR/claude-$1"
  valid_name "$name"
  [[ -d "$dir" ]] || die "профиля '$name' нет ($dir)"
  # rm -rf не идёт по симлинкам: общие данные в $MAIN_DIR остаются.
  rm -rf "$dir"
  [[ -f "$wrapper" ]] && grep -q "$MARK" "$wrapper" && rm -f "$wrapper"
  echo "Профиль '$name' удалён. Общие memory и сессии на месте в $MAIN_DIR."
}

list() {
  local dir
  echo "main  $MAIN_DIR  $(email_in "$MAIN_CONFIG")"
  shopt -s nullglob
  for dir in "$HOME"/.claude-*/; do
    dir="${dir%/}"
    [[ -L "$dir/projects" ]] || continue
    echo "${dir##*/.claude-}  $dir  $(email_in "$dir/.claude.json")"
  done
}

case "${1:-}" in
  --list|"") list ;;
  --remove)  [[ -n "${2:-}" ]] || die "usage: setup-account.sh --remove <name>"; remove "$2" ;;
  -*)        die "неизвестный флаг $1" ;;
  *)         create "$1" ;;
esac
