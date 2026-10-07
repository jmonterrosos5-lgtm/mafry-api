#!/usr/bin/env bash
# Demostración en vivo de los controles de seguridad contra la API desplegada.
# Uso (las credenciales se pasan por variables, no se escriben aquí):
#   API=https://mafry-api.onrender.com \
#   VEND1_CORREO=... VEND1_CLAVE=... VEND2_CORREO=... VEND2_CLAVE=... \
#   ./scripts/demo_seguridad.sh
set -uo pipefail
API="${API:-http://localhost:3000}"
: "${VEND1_CORREO:?}" "${VEND1_CLAVE:?}" "${VEND2_CORREO:?}" "${VEND2_CLAVE:?}"

titulo() { printf '\n\033[1;34m▶ %s\033[0m\n' "$1"; }
estado() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
login() { curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"correo\":\"$1\",\"contrasena\":\"$2\"}" | sed -E 's/.*"token":"([^"]+)".*/\1/'; }

titulo "1. Disponibilidad: /health"
curl -s "$API/health"; echo

titulo "2. Cabeceras de seguridad (Helmet)"
curl -sI "$API/health" | grep -iE 'strict-transport|content-security|x-content-type|x-frame|x-powered-by|x-request-id'
echo "(x-powered-by no aparece: la tecnología del servidor no se revela)"

titulo "3. Acceso sin token → esperado 401"
echo "GET /api/pedidos sin token: $(estado "$API/api/pedidos")"

titulo "4. Token falsificado → esperado 401"
FALSO='eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjEsInJvbCI6ImFkbWluIn0.firma-falsa'
echo "GET /api/vendedores con token falso: $(estado -H "Authorization: Bearer $FALSO" "$API/api/vendedores")"

titulo "5. Inyección SQL en el login → esperado 400/401"
curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"correo\":\"admin@mafry.test' OR '1'='1\",\"contrasena\":\"' OR '1'='1\"}"; echo

T1=$(login "$VEND1_CORREO" "$VEND1_CLAVE")
T2=$(login "$VEND2_CORREO" "$VEND2_CLAVE")

titulo "6. Vendedor intenta entrar a funciones de administrador → esperado 403"
echo "GET /api/vendedores: $(estado -H "Authorization: Bearer $T1" "$API/api/vendedores")"
echo "GET /api/admin/dashboard: $(estado -H "Authorization: Bearer $T1" "$API/api/admin/dashboard")"

titulo "7. IDOR: vendedor 1 intenta ver un pedido del vendedor 2 → esperado 404"
ID2=$(curl -s -H "Authorization: Bearer $T2" "$API/api/pedidos" | sed -E 's/^\[\{"id_pedido":([0-9]+).*/\1/')
echo "Pedido #$ID2 visto por su dueño: $(estado -H "Authorization: Bearer $T2" "$API/api/pedidos/$ID2")"
echo "Pedido #$ID2 visto por otro vendedor: $(estado -H "Authorization: Bearer $T1" "$API/api/pedidos/$ID2")"

titulo "8. Validación de entradas: cantidad negativa → esperado 400"
curl -s -X POST "$API/api/pedidos" -H "Authorization: Bearer $T1" -H 'Content-Type: application/json' \
  -d '{"id_visita":1,"items":[{"id_producto":1,"cantidad":-5}]}'; echo

titulo "9. Manejo de errores: JSON roto → 400 sin detalles internos"
curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' -d '{"correo":'; echo

titulo "10. Fuerza bruta: 6 intentos fallidos sobre la cuenta del vendedor 2"
for i in 1 2 3 4 5 6; do
  printf 'Intento %s → HTTP %s\n' "$i" "$(estado -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"correo\":\"$VEND2_CORREO\",\"contrasena\":\"incorrecta$i\"}")"
done
echo "(401 = credenciales inválidas; 423 = cuenta bloqueada 15 min. Desbloquear desde el panel → Vendedores)"
