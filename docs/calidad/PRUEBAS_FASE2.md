# Pruebas automatizadas — Fase 2 (E10, E11, E14)

## Niveles de prueba (no se mezclan)

| Nivel | Herramienta | Ubicación | Qué verifica | Comando |
|---|---|---|---|---|
| **Unitarias** | Jest (+ jsdom para el panel) | `tests/unit/` | Una función o controlador **aislado**: BD, bcrypt, TOTP, bitácora y `fetch` reemplazados por dobles de prueba | `npm run test:unit` |
| Integración | Jest + supertest + PostgreSQL | `tests/*.test.js` | La API completa contra una base real (existían desde la v2, **no se cuentan como aporte de la Fase 2**) | `npm run test:integration` |
| **API** | Postman + Newman | `tests/api/` | Solicitudes HTTP reales a la API levantada: código, esquema JSON y contenido | `npm run test:api` |
| **Carga** | k6 | `tests/carga/` | Tiempo de respuesta, throughput y errores con 50 usuarios virtuales en la nube | `k6 run tests/carga/carga_mafry.js` |

> Postman/Newman **no** ejecuta pruebas unitarias: son pruebas de API (caja negra sobre HTTP).

## Línea base (sección 2.4 del enunciado)

Medida en el commit `217baf7` (estado del repositorio al iniciar la Fase 2):

| Concepto | Valor |
|---|---|
| Pruebas unitarias existentes | **0** |
| Pruebas automatizadas existentes | 67 pruebas de integración (6 archivos `tests/*.test.js`), `npm test` |
| Cobertura **unitaria** de los módulos críticos (Autenticación, Pedidos, Cobros) | **0 %** |
| Cobertura de los módulos críticos con las pruebas de integración (referencia) | authController 81.9 % líneas · pedidosController 97.0 % · cobrosController 77.5 % · middleware/auth 96.7 % |

## Resultado de la Fase 2 — pruebas unitarias

**88 pruebas unitarias** (67 backend + 21 frontend), todas escritas por el equipo en la Fase 2.

| Archivo | Unidad bajo prueba | Pruebas |
|---|---|---|
| `tests/unit/backend/authController.test.js` | Autenticación: login, bloqueo, MFA, sesión | 24 |
| `tests/unit/backend/authMiddleware.test.js` | Verificación de JWT y RBAC | 10 |
| `tests/unit/backend/pedidosController.test.js` | Pedidos: creación, stock, transiciones de estado | 20 |
| `tests/unit/backend/cobrosController.test.js` | Cobros: saldo, métodos de pago, segregación | 13 |
| `tests/unit/frontend/panelLib.test.js` | Panel web: DOM seguro, formato, cliente HTTP | 21 |

Cobertura unitaria sobre el alcance de módulos críticos (`jest.unit.config.js`):

| Métrica | Línea base | Fase 2 | Incremento |
|---|---|---|---|
| Líneas | 0 % | 97.9 % | +97.9 pp |
| Ramas | 0 % | 91.7 % | +91.7 pp |
| Funciones | 0 % | 97.6 % | +97.6 pp |

El pipeline falla si la cobertura baja de 70 % (RNF-05).

## Dobles de prueba y justificación

| Dependencia aislada | Tipo de doble | Por qué se aisló |
|---|---|---|
| `src/config/db.js` (pool de PostgreSQL) | Mock | Se prueba la lógica del controlador, no la BD. Permite forzar stock insuficiente, saldo excedido o un error a mitad de transacción y verificar el `ROLLBACK`; sin red y en milisegundos. |
| `bcryptjs` | Stub | Con costo 12 tarda ~250 ms por llamada. El stub decide si la contraseña coincide y permite comprobar que se compara contra un hash ficticio cuando el correo no existe (anti-enumeración). |
| `src/utils/totp.js` | Stub | Los códigos TOTP cambian cada 30 s; con el stub se prueba la protección contra reutilización de códigos sin depender del reloj. |
| `src/utils/bitacora.js` | Spy | Escribe en la BD; el spy verifica qué evento de auditoría se registra. |
| `src/config/env.js` | Stub | Evita depender de variables de entorno y secretos reales. |
| `fetch` (panel web) | Mock | El cliente HTTP del panel recibe `fetch` por inyección; se simulan respuestas 200/400/401/502 sin levantar la API. |

Para poder probar el frontend de forma aislada, las utilidades del panel se separaron de `app.js`
a `public/admin/lib.js` y el cliente HTTP recibe sus dependencias por parámetro.

## Pruebas de API (Postman + Newman)

Colección `tests/api/MAFRY.postman_collection.json`: **29 solicitudes, 114 aserciones**.
Cada solicitud verifica código de respuesta, `Content-Type` JSON, esquema JSON (`jsonSchema`) y contenido.

Flujo de negocio encadenado (carpeta 04), cada paso usa variables guardadas por el anterior:
login → listar productos y clientes → **iniciar visita → crear pedido → verificar descuento de stock →
confirmar → entregar → cobro rechazado (excede saldo) → cobro rechazado (sin referencia) →
cobro parcial → cobro del resto → saldo 0 → verificar cobro → anular entregado (rechazado)**.

En el pipeline, la API se levanta dentro del job con un PostgreSQL de servicio (sin contraseña; las
contraseñas de prueba y el JWT_SECRET se generan al azar en cada ejecución), se crean el esquema y
los datos de prueba y se ejecuta Newman. El reporte JUnit queda como artefacto.

## Prueba de carga (k6)

`tests/carga/carga_mafry.js`: rampa 0 → 50 VU en 1 min, 50 VU sostenidos 5 min, bajada 30 s.
Endpoints críticos: `GET /api/pedidos`, `GET /api/productos`, `GET /api/pedidos/{id}`.
Umbrales: p95 < 500 ms (RNF-01) y tasa de error < 1 %.

Se ejecuta contra QA con `RATE_LIMIT_GENERAL` elevado temporalmente (el límite anti abuso de
300 solicitudes / 15 min por IP bloquearía a k6, que envía todo desde una sola IP).
Manual: Actions → **Prueba de carga (k6)** → Run workflow.
