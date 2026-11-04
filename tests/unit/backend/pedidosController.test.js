/**
 * Pruebas unitarias — Módulo crítico: Pedidos (src/controllers/pedidosController.js)
 * Requerimientos: RF-05/RF-06 (crear pedido y calcular total), RF-07 (estados del pedido).
 *
 * Dobles de prueba y justificación:
 *  - db (mock de pool y del cliente de transacción): permite simular stock insuficiente,
 *    productos inactivos o un fallo a mitad de la transacción y comprobar que se ejecute
 *    ROLLBACK y se libere la conexión. Reproducir esto con una BD real sería lento e inestable.
 *  - bitacora (spy): verifica el registro de auditoría sin escribir en la BD.
 */
jest.mock('../../../src/config/env', () => require('../helpers/envStub'));
jest.mock('../../../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../../src/utils/bitacora', () => ({ registrar: jest.fn() }));

const pool = require('../../../src/config/db');
const { registrar } = require('../../../src/utils/bitacora');
const { ErrorApp } = require('../../../src/middleware/errores');
const c = require('../../../src/controllers/pedidosController');
const { filas, resFalso, clienteTransaccion, reqAdmin, reqVendedor } = require('../helpers/dobles');

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockResolvedValue(filas());
});

describe('consultas con control de acceso por rol', () => {
  test('el vendedor solo consulta SUS pedidos (filtro por id_vendedor)', async () => {
    await c.getPedidos(reqVendedor(), resFalso());
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('WHERE v.id_vendedor = $1');
    expect(params).toEqual([1]);
  });

  test('el administrador consulta todos los pedidos', async () => {
    await c.getPedidos(reqAdmin(), resFalso());
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).not.toContain('WHERE v.id_vendedor');
    expect(params).toBeUndefined();
  });

  test('pedido de otro vendedor → 404 (protección IDOR)', async () => {
    pool.query.mockResolvedValueOnce(filas());
    const res = resFalso();
    await c.getPedidoById(reqVendedor({ params: { id: 99 } }), res);
    expect(pool.query.mock.calls[0][1]).toEqual([99, 1]);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('detalle de pedido → combina encabezado e ítems', async () => {
    pool.query
      .mockResolvedValueOnce(filas({ id_pedido: 5, total: '30.00' }))
      .mockResolvedValueOnce(filas({ id_detalle: 1, cantidad: 3 }));
    const res = resFalso();
    await c.getPedidoById(reqAdmin({ params: { id: 5 } }), res);
    expect(res.json).toHaveBeenCalledWith({ id_pedido: 5, total: '30.00', detalles: [{ id_detalle: 1, cantidad: 3 }] });
  });
});

describe('crearPedido', () => {
  const body = { id_visita: 10, items: [{ id_producto: 1, cantidad: 3, precio_unitario: 0.01 }] };

  test('el administrador no puede registrar pedidos → 403', async () => {
    const res = resFalso();
    await c.crearPedido(reqAdmin({ body }), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('pedido válido → 201, usa el precio del CATÁLOGO (ignora el del cliente) y descuenta stock', async () => {
    const client = clienteTransaccion([
      filas({ 1: 1 }),                                                     // visita del vendedor
      filas({ id_pedido: 50 }),                                            // INSERT pedido
      filas({ precio_unitario: '12.50', stock_disponible: 10, nombre: 'Galleta' }),
      filas(), filas(), filas(),                                            // detalle, stock, total
    ]);
    pool.connect.mockResolvedValue(client);
    pool.query.mockResolvedValueOnce(filas({ id_pedido: 50, total: '37.50' }));
    const res = resFalso();

    await c.crearPedido(reqVendedor({ body }), res);

    const insertDetalle = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO detalle_pedido'));
    expect(insertDetalle[1]).toEqual([50, 1, 3, '12.50']);
    const stock = client.query.mock.calls.find(([sql]) => sql.includes('stock_disponible - $1'));
    expect(stock[1]).toEqual([3, 1]);
    expect(client.sentencias()).toContain('COMMIT');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(registrar).toHaveBeenCalledWith(expect.anything(), 'CREAR', 'pedidos', 50, { total: '37.50', items: 1 });
  });

  test('cantidad igual al stock disponible (valor límite) → se acepta', async () => {
    const client = clienteTransaccion([
      filas({ 1: 1 }), filas({ id_pedido: 51 }),
      filas({ precio_unitario: '5.00', stock_disponible: 3, nombre: 'Dulce' }),
    ]);
    pool.connect.mockResolvedValue(client);
    pool.query.mockResolvedValueOnce(filas({ id_pedido: 51, total: '15.00' }));
    const res = resFalso();
    await c.crearPedido(reqVendedor({ body }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('cantidad mayor al stock (stock + 1) → 409 con ROLLBACK y conexión liberada', async () => {
    const client = clienteTransaccion([
      filas({ 1: 1 }), filas({ id_pedido: 52 }),
      filas({ precio_unitario: '5.00', stock_disponible: 2, nombre: 'Dulce' }),
    ]);
    pool.connect.mockResolvedValue(client);

    const error = await c.crearPedido(reqVendedor({ body }), resFalso()).catch((e) => e);

    expect(error).toBeInstanceOf(ErrorApp);
    expect(error.estado).toBe(409);
    expect(error.message).toContain('Stock insuficiente de Dulce');
    expect(client.sentencias()).toContain('ROLLBACK');
    expect(client.sentencias()).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('visita que no pertenece al vendedor → 404', async () => {
    const client = clienteTransaccion([filas()]);
    pool.connect.mockResolvedValue(client);
    const error = await c.crearPedido(reqVendedor({ body }), resFalso()).catch((e) => e);
    expect(error.estado).toBe(404);
    expect(client.release).toHaveBeenCalled();
  });

  test('producto inactivo o inexistente → 400', async () => {
    const client = clienteTransaccion([filas({ 1: 1 }), filas({ id_pedido: 53 }), filas()]);
    pool.connect.mockResolvedValue(client);
    const error = await c.crearPedido(reqVendedor({ body }), resFalso()).catch((e) => e);
    expect(error.estado).toBe(400);
    expect(error.message).toBe('Producto 1 no disponible');
  });

  test('error inesperado de la BD → se propaga y se hace ROLLBACK', async () => {
    const client = clienteTransaccion([new Error('conexión perdida')]);
    pool.connect.mockResolvedValue(client);
    await expect(c.crearPedido(reqVendedor({ body }), resFalso())).rejects.toThrow('conexión perdida');
    expect(client.sentencias()).toContain('ROLLBACK');
  });
});

describe('actualizarEstadoPedido — transición de estados', () => {
  const ejecutar = async (estadoActual, nuevo, req, idVendedorPedido = 1) => {
    const client = clienteTransaccion([filas({ estado: estadoActual, id_vendedor: idVendedorPedido }), filas(), filas({ id_pedido: 8, estado: nuevo })]);
    pool.connect.mockResolvedValue(client);
    const res = resFalso();
    const error = await c.actualizarEstadoPedido({ ...req, params: { id: 8 }, body: { estado: nuevo } }, res).catch((e) => e);
    return { client, res, error };
  };

  test.each([
    ['pendiente', 'confirmado'],
    ['confirmado', 'entregado'],
    ['confirmado', 'anulado'],
  ])('admin: %s → %s es una transición válida', async (desde, hacia) => {
    const { res, error } = await ejecutar(desde, hacia, reqAdmin());
    expect(error).toBeUndefined();
    expect(res.json).toHaveBeenCalled();
  });

  test.each([
    ['entregado', 'anulado'],
    ['anulado', 'pendiente'],
    ['pendiente', 'entregado'],
  ])('admin: %s → %s es inválida → 409', async (desde, hacia) => {
    const { error, client } = await ejecutar(desde, hacia, reqAdmin());
    expect(error.estado).toBe(409);
    expect(client.sentencias()).toContain('ROLLBACK');
  });

  test('vendedor puede anular su pedido pendiente y se devuelve el stock', async () => {
    const { client, error } = await ejecutar('pendiente', 'anulado', reqVendedor());
    expect(error).toBeUndefined();
    expect(client.query.mock.calls.some(([sql]) => sql.includes('stock_disponible = pr.stock_disponible + dp.cantidad'))).toBe(true);
  });

  test('vendedor no puede confirmar pedidos → 403', async () => {
    const { error } = await ejecutar('pendiente', 'confirmado', reqVendedor());
    expect(error.estado).toBe(403);
  });

  test('vendedor no puede modificar pedidos de otro vendedor → 404', async () => {
    const { error } = await ejecutar('pendiente', 'anulado', reqVendedor(), 2);
    expect(error.estado).toBe(404);
  });
});
