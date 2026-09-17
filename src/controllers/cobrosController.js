const pool = require('../config/db');

const getCobros = async (req, res) => {
  try {
    let query, params;
    if (req.usuario.rol === 'admin') {
      query = `SELECT co.*, p.total AS total_pedido, u.nombre AS nombre_vendedor, u.apellido AS apellido_vendedor
               FROM cobros co
               LEFT JOIN pedidos p ON p.id_pedido = co.id_pedido
               LEFT JOIN vendedores v ON v.id_vendedor = co.id_vendedor
               LEFT JOIN usuarios u ON u.id_usuario = v.id_usuario
               ORDER BY co.fecha_cobro DESC`;
      params = [];
    } else {
      query = `SELECT co.*, p.total AS total_pedido
               FROM cobros co
               LEFT JOIN pedidos p ON p.id_pedido = co.id_pedido
               WHERE co.id_vendedor = $1
               ORDER BY co.fecha_cobro DESC`;
      params = [req.usuario.id_vendedor];
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener cobros' });
  }
};

const getCobroById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT co.*, p.total AS total_pedido
       FROM cobros co
       LEFT JOIN pedidos p ON p.id_pedido = co.id_pedido
       WHERE co.id_cobro = $1`, [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cobro no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener cobro' });
  }
};

const crearCobro = async (req, res) => {
  try {
    const { id_pedido, monto, metodo, referencia } = req.body;
    if (!id_pedido || !monto || !metodo) {
      return res.status(400).json({ error: 'id_pedido, monto y metodo son requeridos' });
    }
    const result = await pool.query(
      `INSERT INTO cobros (id_pedido, id_vendedor, monto, fecha_cobro, metodo, referencia, estado)
       VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, 'cobrado') RETURNING *`,
      [id_pedido, req.usuario.id_vendedor, monto, metodo, referencia || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear cobro', detalle: err.message });
  }
};

const actualizarCobro = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, referencia } = req.body;
    const result = await pool.query(
      `UPDATE cobros SET estado = COALESCE($1, estado), referencia = COALESCE($2, referencia)
       WHERE id_cobro = $3 RETURNING *`,
      [estado, referencia, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cobro no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar cobro' });
  }
};

module.exports = { getCobros, getCobroById, crearCobro, actualizarCobro };