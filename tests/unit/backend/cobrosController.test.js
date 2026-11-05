/**
 * Pruebas unitarias — Módulo crítico: Cobros (src/controllers/cobrosController.js)
 * Requerimientos: RF-08 (registrar cobro), RF-09 (verificación/anulación por el admin).
 *
 * Dobles de prueba y justificación:
 *  - db (mock): el saldo pendiente se calcula en SQL; con el mock se fija el saldo exacto
 *    para probar los valores límite (monto = saldo, monto = saldo + 0.01) sin preparar
 *    pedidos y cobros reales en una base de datos.
 *  - bitacora (spy): comprueba la acción auditada (CREAR / ANULAR / ACTUALIZAR).
 */
jest.mock('../../../src/config/env', () => require('../helpers/envStub'));
jest.mock('../../../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../../src/utils/bitacora', () => ({ registrar: jest.fn() }));

const pool = require('../../../src/config/db');
const { registrar } = require('../../../src/utils/bitacora');
const c = require('../../../src/controllers/cobrosController');
const { filas, resFalso, clienteTransaccion, reqAdmin, reqVendedor } = require('../helpers/dobles');

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockResolvedValue(filas());
});

const pedido = (extra = {}) => filas({ total: '100.00', estado: 'entregado', saldo: '40.00', ...extra });

async function cobrar(body, filaPedido = pedido()) {
  const client = clienteTransaccion([filaPedido, filas({ id_cobro: 3, ...body })]);
  pool.connect.mockResolvedValue(client);
  const res = resFalso();
  const error = await c.crearCobro(reqVendedor({ body }), res).catch((e) => e);
  return { client, res, error };
}

describe('crearCobro (tabla de decisión: estado del pedido × monto × método × referencia)', () => {
  test('monto igual al saldo, en efectivo y sin referencia → 201', async () => {
    const { res, error, client } = await cobrar({ id_pedido: 1, monto: 40, metodo: 'efectivo' });
    expect(error).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(client.sentencias()).toContain('COMMIT');
    expect(registrar).toHaveBeenCalledWith(expect.anything(), 'CREAR', 'cobros', 3, { id_pedido: 1, monto: 40, metodo: 'efectivo' });
  });

  test('monto que excede el saldo por Q0.01 (valor límite) → 409 con el saldo en el mensaje', async () => {
    const { error, client } = await cobrar({ id_pedido: 1, monto: 40.01, metodo: 'efectivo' });
    expect(error.estado).toBe(409);
    expect(error.message).toBe('El monto excede el saldo pendiente (Q40.00)');
    expect(client.sentencias()).toContain('ROLLBACK');
  });

  test('transferencia sin referencia → 400', async () => {
    const { error } = await cobrar({ id_pedido: 1, monto: 10, metodo: 'transferencia' });
    expect(error.estado).toBe(400);
  });

  test('cheque con referencia → 201', async () => {
    const { res } = await cobrar({ id_pedido: 1, monto: 10, metodo: 'cheque', referencia: 'CH-0091' });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('pedido anulado → 409 aunque el monto sea válido', async () => {
    const { error } = await cobrar({ id_pedido: 1, monto: 10, metodo: 'efectivo' }, pedido({ estado: 'anulado' }));
    expect(error.estado).toBe(409);
    expect(error.message).toBe('No se puede cobrar un pedido anulado');
  });

  test('pedido de otro vendedor → 404 y la consulta filtra por el vendedor autenticado', async () => {
    const { error, client } = await cobrar({ id_pedido: 9, monto: 10, metodo: 'efectivo' }, filas());
    expect(error.estado).toBe(404);
    const consultaPedido = client.query.mock.calls.find(([sql]) => sql.includes('FOR UPDATE OF p'));
    expect(consultaPedido[1]).toEqual([9, 1]);
    expect(client.release).toHaveBeenCalled();
  });

  test('el administrador no registra cobros (segregación de funciones) → 403', async () => {
    const res = resFalso();
    await c.crearCobro(reqAdmin({ body: { id_pedido: 1, monto: 1, metodo: 'efectivo' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('consultas y actualización', () => {
  test('el vendedor solo ve sus cobros', async () => {
    await c.getCobros(reqVendedor(), resFalso());
    expect(pool.query.mock.calls[0][1]).toEqual([1]);
  });

  test('el admin ve todos los cobros', async () => {
    await c.getCobros(reqAdmin(), resFalso());
    expect(pool.query.mock.calls[0][1]).toBeUndefined();
  });

  test('cobro inexistente → 404', async () => {
    const res = resFalso();
    await c.getCobroById(reqVendedor({ params: { id: 5 } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('cobro existente → 200 con los datos', async () => {
    pool.query.mockResolvedValueOnce(filas({ id_cobro: 5 }));
    const res = resFalso();
    await c.getCobroById(reqAdmin({ params: { id: 5 } }), res);
    expect(res.json).toHaveBeenCalledWith({ id_cobro: 5 });
  });

  test('admin anula un cobro → se audita como ANULAR', async () => {
    pool.query.mockResolvedValueOnce(filas({ id_cobro: 5, estado: 'anulado' }));
    const res = resFalso();
    await c.actualizarCobro(reqAdmin({ params: { id: '5' }, body: { estado: 'anulado' } }), res);
    expect(registrar).toHaveBeenCalledWith(expect.anything(), 'ANULAR', 'cobros', 5, { estado: 'anulado' });
  });

  test('cobro ya anulado no se puede modificar → 404', async () => {
    const res = resFalso();
    await c.actualizarCobro(reqAdmin({ params: { id: '5' }, body: { estado: 'verificado' } }), res);
    expect(pool.query.mock.calls[0][0]).toContain("estado <> 'anulado'");
    expect(res.status).toHaveBeenCalledWith(404);
    // Revisión PR #18: una actualización rechazada no debe quedar auditada
    expect(registrar).not.toHaveBeenCalled();
  });
});
