// Dobles de prueba compartidos por las pruebas unitarias.
//
// ¿Por qué se aíslan estas dependencias?
//  - Base de datos (src/config/db.js → pg.Pool): una prueba unitaria verifica la lógica del
//    controlador, no PostgreSQL. Con un mock la prueba no necesita red ni datos, corre en
//    milisegundos y permite forzar casos difíciles de reproducir (stock insuficiente, saldo
//    excedido, error a mitad de transacción para comprobar el ROLLBACK).
//  - Bitácora (src/utils/bitacora.js): escribe en la BD. Se reemplaza por un spy para
//    comprobar QUÉ evento de auditoría se registra sin depender de la tabla.
//  - Configuración (src/config/env.js): exige variables de entorno reales. Un stub con
//    valores fijos hace la prueba determinista.

// Respuesta de pg: { rows: [...] }
const filas = (...rows) => ({ rows });

// Objeto res de Express falso: registra status y json para hacer aserciones.
function resFalso() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

// Cliente de transacción (pool.connect()) cuyas consultas se responden en orden.
// Las sentencias BEGIN/COMMIT/ROLLBACK se responden solas para que la prueba
// solo declare las consultas de negocio.
function clienteTransaccion(respuestas = []) {
  const cola = [...respuestas];
  const client = {
    query: jest.fn(async (sql) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(String(sql).trim())) return filas();
      const r = cola.shift();
      if (r instanceof Error) throw r;
      return r ?? filas();
    }),
    release: jest.fn(),
  };
  client.sentencias = () => client.query.mock.calls.map(([sql]) => String(sql).trim().split(/\s+/)[0]);
  return client;
}

const reqVendedor = (extra = {}) => ({ usuario: { id_usuario: 2, rol: 'vendedor', id_vendedor: 1 }, ip: '127.0.0.1', ...extra });
const reqAdmin = (extra = {}) => ({ usuario: { id_usuario: 1, rol: 'admin', id_vendedor: null }, ip: '127.0.0.1', ...extra });

module.exports = { filas, resFalso, clienteTransaccion, reqVendedor, reqAdmin };
