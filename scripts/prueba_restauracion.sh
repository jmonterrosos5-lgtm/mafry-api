#!/usr/bin/env bash
# =====================================================================
# MAFRY · Respaldo + prueba controlada de restauración
#
#   ORIGEN_URL=...  DESTINO_URL=...  ./scripts/prueba_restauracion.sh [carpeta]
#
# 1. Calcula una "huella" (conteo + MD5) de cada tabla en el ORIGEN (Neon).
# 2. Hace el respaldo con pg_dump (formato custom) y calcula su SHA-256.
# 3. Vuelve a calcular la huella del origen: si cambió, hubo escrituras durante
#    el respaldo y esa tabla se marca como "en uso" (no es error del respaldo).
# 4. Restaura el respaldo en una base VACÍA y aislada (DESTINO), nunca en producción.
# 5. Compara tabla por tabla origen vs. restaurado y mide el tiempo de restauración (RTO).
# 6. Escribe un informe en Markdown. Termina con error si algo no coincide.
#
# Seguridad: ORIGEN_URL debe usar el rol de solo lectura mafry_respaldo.
# Las cadenas de conexión no se imprimen nunca.
# =====================================================================
set -euo pipefail

: "${ORIGEN_URL:?Defina ORIGEN_URL (rol mafry_respaldo)}"
: "${DESTINO_URL:?Defina DESTINO_URL (base vacía de prueba)}"
# Quita saltos de línea y espacios que se cuelan al pegar la cadena en un secreto
ORIGEN_URL="$(printf '%s' "$ORIGEN_URL" | tr -d '\r\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
DESTINO_URL="$(printf '%s' "$DESTINO_URL" | tr -d '\r\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
SALIDA="${1:-./respaldos}"
mkdir -p "$SALIDA"
chmod 700 "$SALIDA"

FECHA="$(date -u +%Y%m%d_%H%M%S)"
DUMP="$SALIDA/mafry_${FECHA}.dump"
INFORME="$SALIDA/informe_restauracion_${FECHA}.md"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ahora_ms() { date +%s%3N; }

# Destino debe estar vacío: protección para no restaurar sobre una base con datos
TABLAS_DESTINO=$(psql "$DESTINO_URL" -XAtqc "SELECT count(*) FROM pg_tables WHERE schemaname='public'")
if [ "$TABLAS_DESTINO" != "0" ]; then
  echo "❌ La base destino no está vacía ($TABLAS_DESTINO tablas). Se cancela para no sobrescribir datos." >&2
  exit 2
fi

huella() {  # $1 = url, $2 = archivo de salida  → "tabla|filas|md5"
  local url="$1" out="$2"
  psql "$url" -XAtqc "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1" > "$TMP/tablas"
  : > "$out"
  while read -r t; do
    [ -z "$t" ] && continue
    psql "$url" -XAtqc "SELECT '$t' || '|' || count(*) || '|' || coalesce(md5(string_agg(x::text, '¦' ORDER BY x::text)), '-') FROM public.\"$t\" x" >> "$out"
  done < "$TMP/tablas"
}

VERSION_ORIGEN=$(psql "$ORIGEN_URL" -XAtqc "SHOW server_version" | cut -d" " -f1)
ETIQUETA="${ORIGEN_ETIQUETA:-Neon · producción}"
echo "▶ Huella del origen (antes del respaldo)…"
huella "$ORIGEN_URL" "$TMP/antes"

echo "▶ Respaldo con pg_dump…"
T0=$(ahora_ms)
pg_dump --no-owner --no-privileges -Fc "$ORIGEN_URL" -f "$DUMP"
T1=$(ahora_ms)
chmod 600 "$DUMP"
( cd "$SALIDA" && sha256sum "$(basename "$DUMP")" > "$(basename "$DUMP").sha256" )
SHA=$(cut -d' ' -f1 "$DUMP.sha256")
TAMANO=$(du -h "$DUMP" | cut -f1)

echo "▶ Huella del origen (después del respaldo)…"
huella "$ORIGEN_URL" "$TMP/despues"

echo "▶ Verificando integridad del archivo y restaurando en la base de prueba…"
( cd "$SALIDA" && sha256sum -c "$(basename "$DUMP").sha256" > /dev/null )
T2=$(ahora_ms)
pg_restore --no-owner --no-privileges --exit-on-error -d "$DESTINO_URL" "$DUMP"
T3=$(ahora_ms)

echo "▶ Comparando tabla por tabla…"
huella "$DESTINO_URL" "$TMP/restaurado"

ERRORES=0
FILAS_TABLA=""
TOTAL_FILAS=0
while IFS='|' read -r t n_antes h_antes; do
  linea_desp=$(grep "^$t|" "$TMP/despues" || true)
  linea_rest=$(grep "^$t|" "$TMP/restaurado" || true)
  n_rest=$(echo "$linea_rest" | cut -d'|' -f2)
  h_rest=$(echo "$linea_rest" | cut -d'|' -f3)
  if [ "$linea_desp" != "$t|$n_antes|$h_antes" ]; then
    estado="⚠️ en uso durante el respaldo"
  elif [ "$n_rest" = "$n_antes" ] && [ "$h_rest" = "$h_antes" ]; then
    estado="✅ coincide"
  else
    estado="❌ NO coincide"
    ERRORES=$((ERRORES + 1))
  fi
  TOTAL_FILAS=$((TOTAL_FILAS + n_antes))
  FILAS_TABLA+="| $t | $n_antes | ${n_rest:-0} | \`${h_antes:0:12}…\` | $estado |"$'\n'
done < "$TMP/antes"

RESPALDO_S=$(awk "BEGIN{printf \"%.1f\", ($T1-$T0)/1000}")
RESTAURA_S=$(awk "BEGIN{printf \"%.1f\", ($T3-$T2)/1000}")
RESULTADO=$([ "$ERRORES" -eq 0 ] && echo "EXITOSA" || echo "FALLIDA")

cat > "$INFORME" <<EOF
# Informe de prueba de restauración · MAFRY

| Dato | Valor |
|---|---|
| Fecha (UTC) | $(date -u '+%Y-%m-%d %H:%M:%S') |
| Origen | ${ETIQUETA} · PostgreSQL ${VERSION_ORIGEN} · rol de solo lectura |
| Destino | Base vacía y aislada (no es producción) |
| Archivo | $(basename "$DUMP") (${TAMANO}) |
| SHA-256 | \`${SHA}\` |
| Duración del respaldo | ${RESPALDO_S} s |
| Duración de la restauración | ${RESTAURA_S} s |
| Filas verificadas | ${TOTAL_FILAS} |
| Resultado | **${RESULTADO}** (${ERRORES} tablas con diferencias) |

| Tabla | Filas origen | Filas restauradas | Huella MD5 | Estado |
|---|---:|---:|---|---|
${FILAS_TABLA}
EOF

cat "$INFORME"
[ "$ERRORES" -eq 0 ] || { echo "❌ La restauración no coincide con el origen" >&2; exit 1; }
echo "✅ Restauración verificada"
