# Informe de prueba de restauración · MAFRY

| Dato | Valor |
|---|---|
| Fecha (UTC) | 2026-10-22 00:45:51 |
| Origen | Ambiente controlado de pruebas (copia con datos de demostración) · PostgreSQL 16.15 · rol de solo lectura |
| Destino | Base vacía y aislada (no es producción) |
| Archivo | mafry_20261022_004548.dump (44K) |
| SHA-256 | `b4fb327dbe0d1054e5f7f69cda8fa7eaebb9cd6fa35f4d1c7be34f6af8a94be3` |
| Duración del respaldo | 0.1 s |
| Duración de la restauración | 0.2 s |
| Filas verificadas | 233 |
| Resultado | **EXITOSA** (0 tablas con diferencias) |

| Tabla | Filas origen | Filas restauradas | Huella MD5 | Estado |
|---|---:|---:|---|---|
| bitacora | 53 | 53 | `02e167ca7d5c…` | ✅ coincide |
| categorias | 4 | 4 | `15e85bd39b89…` | ✅ coincide |
| clientes | 8 | 8 | `f43a06cc9e91…` | ✅ coincide |
| cobros | 17 | 17 | `2cbb41945238…` | ✅ coincide |
| detalle_pedido | 74 | 74 | `741c61032c24…` | ✅ coincide |
| pedidos | 26 | 26 | `24672fe6ac84…` | ✅ coincide |
| productos | 10 | 10 | `db9cfdb00310…` | ✅ coincide |
| rutas | 2 | 2 | `49e080d3e2c3…` | ✅ coincide |
| usuarios | 7 | 7 | `43955f011d84…` | ✅ coincide |
| vendedores | 5 | 5 | `4be82d0240ba…` | ✅ coincide |
| visitas | 27 | 27 | `f8bbce9427ab…` | ✅ coincide |

