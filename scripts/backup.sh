#!/usr/bin/env bash
# Respaldo de la base de datos MAFRY con pg_dump.
# Uso:  DATABASE_URL=... ./scripts/backup.sh [carpeta_destino]
# - Formato custom (-Fc): comprimido y restaurable con pg_restore.
# - Conserva los últimos 7 respaldos (rotación).
# - Calcula SHA-256 para verificar la integridad del archivo.
set -euo pipefail

: "${DATABASE_URL:?Defina DATABASE_URL (no se escribe en este archivo)}"
DESTINO="${1:-./respaldos}"
mkdir -p "$DESTINO"
chmod 700 "$DESTINO"

ARCHIVO="$DESTINO/mafry_$(date +%Y%m%d_%H%M%S).dump"
pg_dump --no-owner --no-privileges -Fc "$DATABASE_URL" -f "$ARCHIVO"
chmod 600 "$ARCHIVO"
sha256sum "$ARCHIVO" > "$ARCHIVO.sha256"

# Verificación: el respaldo debe poder listarse con pg_restore
pg_restore --list "$ARCHIVO" > /dev/null
echo "✅ Respaldo creado y verificado: $ARCHIVO"

# Rotación: dejar solo los 7 más recientes
ls -1t "$DESTINO"/mafry_*.dump | tail -n +8 | while read -r viejo; do
  rm -f "$viejo" "$viejo.sha256"
done
