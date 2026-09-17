const pool = require('../config/db');

const getPedidos = async (req, res) => {
  try {
    let query, params;
    if (req.usuario.rol === 'admin') {
      query = `SELECT p.*, c.nombre_negocio, u.nombre AS nombre_vendedor, u.apellido AS apellido_vendedor
               FROM pedidos p
               LEFT JOIN visitas v ON v.id_visita = p.id_visita
               LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
               LEFT JOIN vendedores vend ON vend.id_vendedor = v.id_vendedor
               LEFT JOIN usuarios u ON u.id_usuario = vend.id_usuario
               ORDER BY p.fecha_pedido DESC`;
      params = [];
    } else {
      query = `SELECT p.*, c.nombre_negocio
               FROM pedidos p
               LEFT JOIN visitas v ON v.id_visita = p.id_visita
               LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
               WHERE v.id_vendedor = $1
               ORDER BY p.fecha_pedido DESC`;
      params = [req.usuario.id_vendedor];
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
};

const getPedidoById = async (req, res) => {
  try {
    const { id } = req.params;
    const pedido = await pool.query(
      `SELECT p.*, c.nombre_negocio FROM pedidos p
       LEFT JOIN visitas v ON v.id_visita = p.id_visita
       LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
       WHERE p.id_pedido = $1`, [id]
    );
    if (pedido.rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });

    const detalles = await pool.query(
      `SELECT dp.*, pr.nombre AS nombre_producto, pr.codigo_producto
       FROM detalle_pedido dp
       LEFT JOIN productos pr ON pr.id_producto = dp.id_producto
       WHERE dp.id_pedido = $1`, [id]
    );

    res.json({ ...pedido.rows[0], detalles: detalles.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener pedido' });
  }
};

const crearPedido = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id_visita, items, observaciones, metodo_pago } = req.body;
    if (!id_visita || !items || items.length === 0) {
      return res.status(400).json({ error: 'id_visita e items son requeridos' });
    }

    await client.query('BEGIN');

    const pedidoResult = await client.query(
      `INSERT INTO pedidos (id_visita, estado, observaciones, metodo_pago)
       VALUES ($1, 'pendiente', $2, $3) RETURNING *`,
      [id_visita, observaciones || null, metodo_pago || null]
    );
    const pedido = pedidoResult.rows[0];

    for (const item of items) {
      const { id_producto, cantidad, precio_unitario } = item;
      await client.query(
        `INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario)
         VALUES ($1, $2, $3, $4)`,
        [pedido.id_pedido, id_producto, cantidad, precio_unitario]
      );
    }

    const totalResult = await client.query(
      'SELECT COALESCE(SUM(cantidad * precio_unitario), 0) AS total FROM detalle_pedido WHERE id_pedido = $1',
      [pedido.id_pedido]
    );
    await client.query('UPDATE pedidos SET total = $1 WHERE id_pedido = $2',
      [totalResult.rows[0].total, pedido.id_pedido]);

    await client.query('COMMIT');

    const pedidoFinal = await pool.query('SELECT * FROM pedidos WHERE id_pedido = $1', [pedido.id_pedido]);
    res.status(201).json(pedidoFinal.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al crear pedido', detalle: err.message });
  } finally {
    client.release();
  }
};

const actualizarEstadoPedido = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, observaciones, metodo_pago } = req.body;
    const result = await pool.query(
      `UPDATE pedidos SET estado = COALESCE($1, estado), observaciones = COALESCE($2, observaciones), metodo_pago = COALESCE($3, metodo_pago)
       WHERE id_pedido = $4 RETURNING *`,
      [estado, observaciones, metodo_pago, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar pedido' });
  }
};

module.exports = { getPedidos, getPedidoById, crearPedido, actualizarEstadoPedido };