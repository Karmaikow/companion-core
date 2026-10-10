#!/usr/bin/env bash
set -euo pipefail
umask 077
source_root="$(cd "$(dirname "$0")/.." && pwd -P)"
target_root="${MAYUNA_MOBILE_HOME:-$HOME/mayuna-mobile}"
backup_root="${MAYUNA_BACKUP_DIR:-$HOME/.companion-backups}"
if [ -L "$target_root" ] || [ -L "$backup_root" ]; then
  echo 'Destino ou pasta de backup é um link simbólico. Confira os caminhos antes de atualizar.' >&2
  exit 1
fi
if [ -d "$target_root/.git" ]; then
  echo 'Esta instalação usa Git. Atualize com git pull e npm run build, preservando seus dados.' >&2
  exit 1
fi
if [ ! -f "$source_root/dist/server/web-server.js" ]; then
  echo 'Use este atualizador a partir do pacote Termux pré-compilado.' >&2
  exit 1
fi
if [ "$source_root" = "$target_root" ]; then
  echo 'Execute o atualizador da pasta de extração, antes de copiar para a instalação.' >&2
  exit 1
fi
if ! command -v node >/dev/null; then
  echo 'Instale Node.js no Termux: pkg install nodejs-lts' >&2
  exit 1
fi
node -e 'if(Number(process.versions.node.split(".")[0])<20){console.error("Use Node.js 20 ou posterior.");process.exit(1)}'
echo 'O servidor antigo deve estar parado (Ctrl+C) antes desta atualização.'
backup_items=()
for item in .mayuna-mobile-preview data .env; do
  if [ -e "$target_root/$item" ]; then backup_items+=("$item"); fi
done
if [ "${#backup_items[@]}" -gt 0 ]; then
  mkdir -p "$backup_root"
  backup_file="$(mktemp "$backup_root/mobile-before-v03-XXXXXXXX.tar.gz")"
  tar -czf "$backup_file" -C "$target_root" -- "${backup_items[@]}"
  chmod 600 "$backup_file"
  echo "Backup privado salvo: $backup_file"
fi
mkdir -p "$target_root"
for folder in dist src web scripts docs; do
  mkdir -p "$target_root/$folder"
  cp -R "$source_root/$folder/." "$target_root/$folder/"
done
for file in package.json package-lock.json tsconfig.json README.md .gitignore MOBILE_VERSION.json; do
  if [ -f "$source_root/$file" ]; then cp "$source_root/$file" "$target_root/$file"; fi
done
echo 'Atualização concluída. Diretórios de dados preservados.'
echo 'cd "$HOME/mayuna-mobile"'
echo 'npm run android:check'
echo 'npm run android:start'
