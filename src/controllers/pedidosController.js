const pool = require('../config/db');
const { esAdmin } = require('../middleware/auth');
const { registrar } = require('../utils/bitacora');
const { ErrorApp } = require('../middleware/errores');

const SALDO = `p.total - COALESCE((SELECT SUM(co.monto) FROM cobros co
                 WHERE co.id_pedido = p.id_pedido AND co.estado <> 'anulado'), 0)`;

const BASE = `SELECT p.*, ${SALDO} AS saldo, c.nombre_negocio, v.id_vendedor,
                     u.nombre || ' ' || u.apellido AS vendedor
                FROM pedidos p
                JOIN visitas v ON v.id_visita = p.id_visita
                LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
                LEFT JOIN vendedores vend ON vend.id_vendedor = v.id_vendedor
                LEFT JOIN usuarios u ON u.id_usuario = vend.id_usuario`;

// Transiciones de estado permitidas (regla de negocio)
const TRANSICIONES = {
  pendiente: ['confirmado', 'anulado'],
  confirmado: ['entregado', 'anulado'],
  entregado: [],
  anulado: [],
};

const getPedidos = async (req, res) => {
  const result = esAdmin(req)
    ? await pool.query(`${BASE} ORDER BY p.fecha_pedido DESC LIMIT 500`)
    : await pool.query(`${BASE} WHERE v.id_vendedor = $1 ORDER BY p.fecha_pedido DESC LIMIT 200`, [req.usuario.id_vendedor]);
  res.json(result.rows);
};

const getPedidoById = async (req, res) => {
  const { id } = req.params;
  const pedido = esAdmin(req)
    ? await pool.query(`${BASE} WHERE p.id_pedido = $1`, [id])
    : await pool.query(`${BASE} WHERE p.id_pedido = $1 AND v.id_vendedor = $2`, [id, req.usuario.id_vendedor]);
  if (pedido.rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });

  const detalles = await pool.query(
    `SELECT dp.id_detalle, dp.id_producto, dp.cantidad, dp.precio_unitario, dp.subtotal,
            pr.nombre AS nombre_producto, pr.codigo_producto
       FROM detalle_pedido dp JOIN productos pr ON pr.id_producto = dp.id_producto
      WHERE dp.id_pedido = $1 ORDER BY dp.id_detalle`, [id]);
  res.json({ ...pedido.rows[0], detalles: detalles.rows });
};

const crearPedido = async (req, res) => {
  if (esAdmin(req)) return res.status(403).json({ error: 'Los pedidos los registra el vendedor en la visita' });
  const { id_visita, items, observaciones, metodo_pago } = req.body;
  const client = await pool.connect();
  let idPedido;
  try {
    await client.query('BEGIN');

    // La visita debe pertenecer al vendedor autenticado
    const visita = await client.query('SELECT 1 FROM visitas WHERE id_visita = $1 AND id_vendedor = $2',
      [id_visita, req.usuario.id_vendedor]);
    if (visita.rows.length === 0) throw new ErrorApp(404, 'Visita no encontrada');

    const pedido = (await client.query(
      `INSERT INTO pedidos (id_visita, estado, observaciones, metodo_pago)
       VALUES ($1, 'pendiente', $2, $3) RETURNING id_pedido`,
      [id_visita, observaciones ?? null, metodo_pago ?? null])).rows[0];
    idPedido = pedido.id_pedido;

    for (const { id_producto, cantidad } of items) {
      // Integridad: el precio SIEMPRE se toma del catálogo, nunca del cliente.
      // FOR UPDATE bloquea la fila para que dos pedidos simultáneos no vendan el mismo stock.
      const prod = await client.query(
        'SELECT precio_unitario, stock_disponible, nombre FROM productos WHERE id_producto = $1 AND activo FOR UPDATE',
        [id_producto]);
      if (prod.rows.length === 0) throw new ErrorApp(400, `Producto ${id_producto} no disponible`);
      if (prod.rows[0].stock_disponible < cantidad) {
        throw new ErrorApp(409, `Stock insuficiente de ${prod.rows[0].nombre} (disponible: ${prod.rows[0].stock_disponible})`);
      }
      await client.query(
        'INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario) VALUES ($1,$2,$3,$4)',
        [pedido.id_pedido, id_producto, cantidad, prod.rows[0].precio_unitario]);
      await client.query('UPDATE productos SET stock_disponible = stock_disponible - $1 WHERE id_producto = $2',
        [cantidad, id_producto]);
    }

    await client.query(
      `UPDATE pedidos SET total = (SELECT COALESCE(SUM(subtotal),0) FROM detalle_pedido WHERE id_pedido = $1)
        WHERE id_pedido = $1`, [pedido.id_pedido]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const final = await pool.query(`${BASE} WHERE p.id_pedido = $1`, [idPedido]);
  await registrar(req, 'CREAR', 'pedidos', final.rows[0].id_pedido, { total: final.rows[0].total, items: items.length });
  res.status(201).json(final.rows[0]);
};

const actualizarEstadoPedido = async (req, res) => {
  const { id } = req.params;
  const { estado, observaciones } = req.body;
  const client = await pool.connect();
  let actualizado;
  try {
    await client.query('BEGIN');
    const actual = await client.query(
      `SELECT p.estado, v.id_vendedor FROM pedidos p JOIN visitas v ON v.id_visita = p.id_visita
        WHERE p.id_pedido = $1 FOR UPDATE OF p`, [id]);
    const fila = actual.rows[0];
    if (!fila || (!esAdmin(req) && fila.id_vendedor !== req.usuario.id_vendedor)) {
      throw new ErrorApp(404, 'Pedido no encontrado');
    }
    if (estado && estado !== fila.estado) {
      if (!TRANSICIONES[fila.estado].includes(estado)) {
        throw new ErrorApp(409, `No se puede pasar de "${fila.estado}" a "${estado}"`);
      }
      // El vendedor solo puede anular sus pedidos pendientes; confirmar/entregar es del admin.
      if (!esAdmin(req) && !(fila.estado === 'pendiente' && estado === 'anulado')) {
        throw new ErrorApp(403, 'Solo el administrador puede cambiar ese estado');
      }
      if (estado === 'anulado') {
        // Devolver el stock reservado
        await client.query(
          `UPDATE productos pr SET stock_disponible = pr.stock_disponible + dp.cantidad
             FROM detalle_pedido dp WHERE dp.id_pedido = $1 AND dp.id_producto = pr.id_producto`, [id]);
      }
    }
    actualizado = (await client.query(
      `UPDATE pedidos SET estado = COALESCE($1, estado), observaciones = COALESCE($2, observaciones)
        WHERE id_pedido = $3 RETURNING *`, [estado ?? null, observaciones ?? null, id])).rows[0];
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await registrar(req, 'CAMBIO_ESTADO', 'pedidos', Number(id), { estado });
  res.json(actualizado);
};

module.exports = { getPedidos, getPedidoById, crearPedido, actualizarEstadoPedido };
