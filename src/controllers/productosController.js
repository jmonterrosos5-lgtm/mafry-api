const pool = require('../config/db');

const getProductos = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.nombre AS categoria
       FROM productos p
       LEFT JOIN categorias c ON c.id_categoria = p.id_categoria
       WHERE p.activo = true
       ORDER BY p.nombre ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
};

const getProductoById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT p.*, c.nombre AS categoria
       FROM productos p
       LEFT JOIN categorias c ON c.id_categoria = p.id_categoria
       WHERE p.id_producto = $1`, [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener producto' });
  }
};

const crearProducto = async (req, res) => {
  try {
    const { id_categoria, nombre, descripcion, precio_unitario, unidad_medida, stock_disponible } = req.body;
    if (!nombre || !precio_unitario) {
      return res.status(400).json({ error: 'nombre y precio_unitario son requeridos' });
    }
    const result = await pool.query(
      `INSERT INTO productos (id_categoria, nombre, descripcion, precio_unitario, unidad_medida, stock_disponible)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id_categoria || null, nombre, descripcion || null, precio_unitario, unidad_medida || 'unidad', stock_disponible || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear producto', detalle: err.message });
  }
};

const actualizarProducto = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, precio_unitario, unidad_medida, stock_disponible, activo } = req.body;
    const result = await pool.query(
      `UPDATE productos SET
        nombre = COALESCE($1, nombre),
        descripcion = COALESCE($2, descripcion),
        precio_unitario = COALESCE($3, precio_unitario),
        unidad_medida = COALESCE($4, unidad_medida),
        stock_disponible = COALESCE($5, stock_disponible),
        activo = COALESCE($6, activo)
       WHERE id_producto = $7 RETURNING *`,
      [nombre, descripcion, precio_unitario, unidad_medida, stock_disponible, activo, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
};

module.exports = { getProductos, getProductoById, crearProducto, actualizarProducto };