// Pruebas funcionales del flujo del vendedor: visita → pedido → cobro, e integridad de datos
const { api, token } = require('./helpers');
const pool = require('../src/config/db');

let kevin; let adm; let idCliente; let prod;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  [kevin, adm] = await Promise.all([token('kevin'), token('admin')]);
  idCliente = (await api().get('/api/clientes').set(auth(kevin))).body[0].id_cliente;
  prod = (await pool.query("SELECT id_producto, precio_unitario, stock_disponible FROM productos WHERE codigo_producto='GOM-001'")).rows[0];
});
afterAll(() => pool.end());

async function nuevaVisita() {
  const res = await api().post('/api/visitas').set(auth(kevin)).send({ id_cliente: idCliente, latitud: 14.65, longitud: -90.46 });
  expect(res.status).toBe(201);
  return res.body.id_visita;
}

describe('Flujo visita → pedido → cobro', () => {
  let idPedido;

  test('el vendedor registra una visita y un pedido; el total se calcula en el servidor', async () => {
    const idVisita = await nuevaVisita();
    const res = await api().post('/api/pedidos').set(auth(kevin)).send({
      id_visita: idVisita, metodo_pago: 'efectivo',
      // Intento de manipulación: precio_unitario de 0.01 enviado por el cliente
      items: [{ id_producto: prod.id_producto, cantidad: 4, precio_unitario: 0.01 }],
    });
    expect(res.status).toBe(201);
    idPedido = res.body.id_pedido;
    expect(Number(res.body.total)).toBeCloseTo(4 * Number(prod.precio_unitario)); // se ignoró el precio falso
    expect(res.body.estado).toBe('pendiente');
  });

  test('el stock se descuenta al registrar el pedido', async () => {
    const r = await pool.query('SELECT stock_disponible FROM productos WHERE id_producto = $1', [prod.id_producto]);
    expect(r.rows[0].stock_disponible).toBe(prod.stock_disponible - 4);
  });

  test('no se puede cobrar más que el saldo pendiente', async () => {
    const res = await api().post('/api/cobros').set(auth(kevin)).send({ id_pedido: idPedido, monto: 999999, metodo: 'efectivo' });
    expect(res.status).toBe(409);
  });

  test('transferencia sin referencia se rechaza', async () => {
    const res = await api().post('/api/cobros').set(auth(kevin)).send({ id_pedido: idPedido, monto: 10, metodo: 'transferencia' });
    expect(res.status).toBe(400);
  });

  test('cobro parcial correcto y el saldo se actualiza', async () => {
    const c = await api().post('/api/cobros').set(auth(kevin)).send({ id_pedido: idPedido, monto: 20, metodo: 'efectivo' });
    expect(c.status).toBe(201);
    const p = await api().get(`/api/pedidos/${idPedido}`).set(auth(kevin));
    expect(Number(p.body.saldo)).toBeCloseTo(4 * Number(prod.precio_unitario) - 20);
    expect(p.body.detalles).toHaveLength(1);
  });

  test('el admin confirma y entrega; no se permiten saltos de estado inválidos', async () => {
    expect((await api().put(`/api/pedidos/${idPedido}`).set(auth(adm)).send({ estado: 'confirmado' })).status).toBe(200);
    expect((await api().put(`/api/pedidos/${idPedido}`).set(auth(adm)).send({ estado: 'entregado' })).status).toBe(200);
    expect((await api().put(`/api/pedidos/${idPedido}`).set(auth(adm)).send({ estado: 'pendiente' })).status).toBe(409);
  });
});

describe('Integridad y validaciones', () => {
  test('pedido con cantidad mayor al stock se rechaza y no deja nada a medias (transacción)', async () => {
    const idVisita = await nuevaVisita();
    const antes = (await pool.query('SELECT COUNT(*)::int n FROM pedidos')).rows[0].n;
    const res = await api().post('/api/pedidos').set(auth(kevin)).send({
      id_visita: idVisita, items: [{ id_producto: prod.id_producto, cantidad: 2 }, { id_producto: prod.id_producto, cantidad: 9999 }],
    });
    expect(res.status).toBe(409);
    const despues = (await pool.query('SELECT COUNT(*)::int n FROM pedidos')).rows[0].n;
    expect(despues).toBe(antes);
  });

  test('anular un pedido pendiente devuelve el stock', async () => {
    const idVisita = await nuevaVisita();
    const antes = (await pool.query('SELECT stock_disponible s FROM productos WHERE id_producto=$1', [prod.id_producto])).rows[0].s;
    const p = await api().post('/api/pedidos').set(auth(kevin)).send({ id_visita: idVisita, items: [{ id_producto: prod.id_producto, cantidad: 3 }] });
    await api().put(`/api/pedidos/${p.body.id_pedido}`).set(auth(kevin)).send({ estado: 'anulado' }).expect(200);
    const despues = (await pool.query('SELECT stock_disponible s FROM productos WHERE id_producto=$1', [prod.id_producto])).rows[0].s;
    expect(despues).toBe(antes);
  });

  test.each([
    [{ id_visita: 1, items: [] }, 'items vacíos'],
    [{ id_visita: 1, items: [{ id_producto: 1, cantidad: -5 }] }, 'cantidad negativa'],
    [{ id_visita: 'abc', items: [{ id_producto: 1, cantidad: 1 }] }, 'visita no numérica'],
  ])('pedido inválido → 400 (%#: %s)', async (cuerpo) => {
    expect((await api().post('/api/pedidos').set(auth(kevin)).send(cuerpo)).status).toBe(400);
  });

  test('la base de datos rechaza un precio negativo aunque se salte la API (CHECK)', async () => {
    await expect(pool.query("UPDATE productos SET precio_unitario = -1 WHERE codigo_producto='GOM-001'")).rejects.toThrow();
  });

  test('cambio de precio queda auditado con valor anterior y nuevo', async () => {
    await api().put(`/api/productos/${prod.id_producto}`).set(auth(adm)).send({ precio_unitario: 23.5 }).expect(200);
    const b = await pool.query("SELECT detalle FROM bitacora WHERE entidad='productos' ORDER BY id_bitacora DESC LIMIT 1");
    expect(b.rows[0].detalle.precio_nuevo).toBe('23.50');
  });
});
