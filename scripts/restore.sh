#!/usr/bin/env bash
# Restaura un respaldo verificando primero su integridad.
# Uso:  DATABASE_URL=... ./scripts/restore.sh respaldos/mafry_YYYYMMDD_HHMMSS.dump
set -euo pipefail
: "${DATABASE_URL:?Defina DATABASE_URL}"
ARCHIVO="${1:?Indique el archivo .dump}"
sha256sum -c "$ARCHIVO.sha256"
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" "$ARCHIVO"
echo "✅ Restauración completada desde $ARCHIVO"
