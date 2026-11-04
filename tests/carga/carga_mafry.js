// Prueba de carga MAFRY (Fase 2 — E14) con k6.
//
// Escenario mínimo exigido: rampa de 0 a 50 usuarios virtuales y 50 VU sostenidos ≥ 5 minutos,
// sobre el ambiente desplegado en la nube. Se evalúa contra RNF-01:
//   "p95 < 500 ms con 50 VUs sostenidos por 5 minutos" (entregable E1).
//
// Endpoints críticos bajo prueba (módulos críticos del E2):
//   1) GET /api/pedidos       — Pedidos: consulta con cálculo de saldo por pedido (JOIN + subconsulta)
//   2) GET /api/productos     — Catálogo que el vendedor consulta para armar cada pedido
//   3) GET /api/pedidos/{id}  — Detalle de un pedido (encabezado + renglones)
// El login se hace UNA sola vez en setup(): el endpoint de login tiene un límite anti fuerza bruta
// y bcrypt (costo 12) es deliberadamente lento; incluirlo en cada iteración mediría la defensa,
// no el rendimiento del negocio.
//
// Uso (PowerShell):
//   $env:BASE_URL="https://mafry-api-qa.onrender.com"; $env:VEND_CORREO="..."; $env:VEND_CONTRASENA="..."
//   k6 run --summary-export=docs/calidad/carga/resumen_k6.json tests/carga/carga_mafry.js
//
// IMPORTANTE: el servicio gratuito de Render se suspende tras ~15 min sin tráfico.
// El setup() hace un "calentamiento" para que el arranque en frío no contamine las métricas.
import http from 'k6/http';
import { check, sleep, group, fail } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'https://mafry-api-qa.onrender.com';

export const options = {
  scenarios: {
    vendedores_en_ruta: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },  // rampa 0 → 50 VU
        { duration: '5m', target: 50 },  // 50 VU sostenidos 5 minutos
        { duration: '30s', target: 0 },  // bajada
      ],
      gracefulRampDown: '10s',
    },
  },
  // Umbrales = requerimientos no funcionales. Si no se cumplen, k6 termina con código ≠ 0.
  thresholds: {
    'http_req_duration{tipo:negocio}': ['p(95)<500'],   // RNF-01
    http_req_failed: ['rate<0.01'],                     // tasa de error < 1 %
    'dur_lista_pedidos': ['p(95)<500'],
    'dur_catalogo': ['p(95)<500'],
    'dur_detalle_pedido': ['p(95)<500'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'max'],
};

const durListaPedidos = new Trend('dur_lista_pedidos', true);
const durCatalogo = new Trend('dur_catalogo', true);
const durDetalle = new Trend('dur_detalle_pedido', true);
const respuestasOk = new Rate('respuestas_ok');

export function setup() {
  // Calentamiento: despierta el servicio de Render si estaba suspendido.
  for (let i = 0; i < 10; i++) {
    const r = http.get(`${BASE_URL}/health`, { timeout: '90s' });
    if (r.status === 200) break;
    sleep(5);
  }
  const res = http.post(`${BASE_URL}/api/auth/login`,
    JSON.stringify({ correo: __ENV.VEND_CORREO, contrasena: __ENV.VEND_CONTRASENA }),
    { headers: { 'Content-Type': 'application/json' } });
  if (res.status !== 200) fail(`No se pudo iniciar sesión (${res.status}). Revise VEND_CORREO / VEND_CONTRASENA.`);
  const token = res.json('token');
  const pedidos = http.get(`${BASE_URL}/api/pedidos`, { headers: { Authorization: `Bearer ${token}` } }).json();
  const ids = (pedidos || []).slice(0, 20).map((p) => p.id_pedido);
  if (!ids.length) fail('El vendedor no tiene pedidos para consultar el detalle.');
  return { token, ids };
}

export default function (datos) {
  const params = { headers: { Authorization: `Bearer ${datos.token}` }, tags: { tipo: 'negocio' } };

  group('Pedidos — listado del vendedor', () => {
    const r = http.get(`${BASE_URL}/api/pedidos`, { ...params, tags: { ...params.tags, endpoint: 'GET /api/pedidos' } });
    durListaPedidos.add(r.timings.duration);
    respuestasOk.add(check(r, { 'pedidos 200': (x) => x.status === 200, 'pedidos es arreglo': (x) => Array.isArray(x.json()) }));
  });
  sleep(1);

  group('Catálogo — productos activos', () => {
    const r = http.get(`${BASE_URL}/api/productos`, { ...params, tags: { ...params.tags, endpoint: 'GET /api/productos' } });
    durCatalogo.add(r.timings.duration);
    respuestasOk.add(check(r, { 'productos 200': (x) => x.status === 200 }));
  });
  sleep(1);

  group('Pedidos — detalle', () => {
    const id = datos.ids[Math.floor(Math.random() * datos.ids.length)];
    const r = http.get(`${BASE_URL}/api/pedidos/${id}`, { ...params, tags: { ...params.tags, endpoint: 'GET /api/pedidos/:id' } });
    durDetalle.add(r.timings.duration);
    respuestasOk.add(check(r, { 'detalle 200': (x) => x.status === 200, 'trae renglones': (x) => Array.isArray(x.json('detalles')) }));
  });
  sleep(1);
}
