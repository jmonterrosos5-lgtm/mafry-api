// Pruebas de autorización (roles) y de acceso a datos de otros usuarios (IDOR)
const { api, token } = require('./helpers');
const pool = require('../src/config/db');

let adm; let kevin; let diego;
let pedidoDiego; let cobroDiego; let visitaDiego; let clienteDiego;

beforeAll(async () => {
  [adm, kevin, diego] = await Promise.all([token('admin'), token('kevin'), token('diego')]);
  const r = await pool.query(`
    SELECT p.id_pedido, vi.id_visita, vi.id_cliente,
           (SELECT id_cobro FROM cobros co WHERE co.id_pedido = p.id_pedido LIMIT 1) AS id_cobro
      FROM pedidos p JOIN visitas vi ON vi.id_visita = p.id_visita
      JOIN vendedores v ON v.id_vendedor = vi.id_vendedor
     WHERE v.codigo_vendedor = 'VEN-002'
       AND EXISTS (SELECT 1 FROM cobros co WHERE co.id_pedido = p.id_pedido)
     LIMIT 1`);
  ({ id_pedido: pedidoDiego, id_visita: visitaDiego, id_cliente: clienteDiego, id_cobro: cobroDiego } = r.rows[0]);
});
afterAll(() => pool.end());

const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('Control de acceso por rol (RBAC)', () => {
  test.each([
    ['GET', '/api/vendedores'],
    ['GET', '/api/admin/dashboard'],
    ['GET', '/api/admin/bitacora'],
    ['POST', '/api/productos'],
  ])('vendedor no puede usar %s %s → 403', async (metodo, ruta) => {
    const res = await api()[metodo.toLowerCase()](ruta).set(auth(kevin)).send({ nombre: 'X', precio_unitario: 1 });
    expect(res.status).toBe(403);
  });

  test('vendedor no puede verificar/anular cobros (segregación de funciones)', async () => {
    const res = await api().put(`/api/cobros/${cobroDiego}`).set(auth(diego)).send({ estado: 'anulado' });
    expect(res.status).toBe(403);
  });

  test('vendedor no puede confirmar pedidos, solo el admin', async () => {
    const res = await api().put(`/api/pedidos/${pedidoDiego}`).set(auth(diego)).send({ estado: 'confirmado' });
    expect([403, 409]).toContain(res.status);
  });

  test('admin sí accede al dashboard y a la bitácora', async () => {
    expect((await api().get('/api/admin/dashboard').set(auth(adm))).status).toBe(200);
    expect((await api().get('/api/admin/bitacora').set(auth(adm))).status).toBe(200);
  });
});

describe('Aislamiento de datos entre vendedores (IDOR)', () => {
  test('Kevin no puede ver un pedido de Diego (404, no revela que existe)', async () => {
    expect((await api().get(`/api/pedidos/${pedidoDiego}`).set(auth(kevin))).status).toBe(404);
    expect((await api().get(`/api/pedidos/${pedidoDiego}`).set(auth(diego))).status).toBe(200);
  });

  test('Kevin no puede ver un cobro, visita ni cliente de Diego', async () => {
    expect((await api().get(`/api/cobros/${cobroDiego}`).set(auth(kevin))).status).toBe(404);
    expect((await api().get(`/api/visitas/${visitaDiego}`).set(auth(kevin))).status).toBe(404);
    expect((await api().get(`/api/clientes/${clienteDiego}`).set(auth(kevin))).status).toBe(404);
  });

  test('Kevin no puede registrar un pedido en una visita de Diego', async () => {
    const prod = (await pool.query('SELECT id_producto FROM productos LIMIT 1')).rows[0].id_producto;
    const res = await api().post('/api/pedidos').set(auth(kevin)).send({ id_visita: visitaDiego, items: [{ id_producto: prod, cantidad: 1 }] });
    expect(res.status).toBe(404);
  });

  test('Kevin no puede cobrar un pedido de Diego', async () => {
    const res = await api().post('/api/cobros').set(auth(kevin)).send({ id_pedido: pedidoDiego, monto: 1, metodo: 'efectivo' });
    expect(res.status).toBe(404);
  });

  test('los listados solo devuelven datos propios', async () => {
    const lista = await api().get('/api/pedidos').set(auth(kevin));
    const idKevin = (await pool.query("SELECT id_vendedor FROM vendedores WHERE codigo_vendedor='VEN-001'")).rows[0].id_vendedor;
    expect(lista.body.length).toBeGreaterThan(0);
    expect(lista.body.every((p) => p.id_vendedor === idKevin)).toBe(true);
  });

  test('IDs no numéricos se rechazan con 400', async () => {
    expect((await api().get('/api/pedidos/1%20OR%201=1').set(auth(adm))).status).toBe(400);
  });
});
