const pool = require('../config/db');

const getVendedores = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT v.*, u.nombre, u.apellido, u.correo
       FROM vendedores v
       LEFT JOIN usuarios u ON u.id_usuario = v.id_usuario
       WHERE v.activo = true
       ORDER BY u.nombre ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener vendedores' });
  }
};

const getVendedorById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT v.*, u.nombre, u.apellido, u.correo
       FROM vendedores v
       LEFT JOIN usuarios u ON u.id_usuario = v.id_usuario
       WHERE v.id_vendedor = $1`, [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vendedor no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener vendedor' });
  }
};

const actualizarVendedor = async (req, res) => {
  try {
    const { id } = req.params;
    const { telefono, zona_asignada, activo } = req.body;
    const result = await pool.query(
      `UPDATE vendedores SET
        telefono = COALESCE($1, telefono),
        zona_asignada = COALESCE($2, zona_asignada),
        activo = COALESCE($3, activo)
       WHERE id_vendedor = $4 RETURNING *`,
      [telefono, zona_asignada, activo, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vendedor no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar vendedor' });
  }
};

module.exports = { getVendedores, getVendedorById, actualizarVendedor };