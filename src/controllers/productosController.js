const pool = require('../config/db');
const { esAdmin } = require('../middleware/auth');
const { registrar } = require('../utils/bitacora');

const BASE = `SELECT p.id_producto, p.codigo_producto, p.id_categoria, p.nombre, p.descripcion,
                     p.precio_unitario, p.unidad_medida, p.stock_disponible, p.activo, c.nombre AS categoria
                FROM productos p LEFT JOIN categorias c ON c.id_categoria = p.id_categoria`;

const getProductos = async (req, res) => {
  // El vendedor solo ve el catálogo activo; el admin ve todo.
  const result = await pool.query(`${BASE} ${esAdmin(req) ? '' : 'WHERE p.activo = true'} ORDER BY p.nombre`);
  res.json(result.rows);
};

const getCategorias = async (req, res) => {
  res.json((await pool.query('SELECT * FROM categorias ORDER BY nombre')).rows);
};

const getProductoById = async (req, res) => {
  const result = await pool.query(`${BASE} WHERE p.id_producto = $1`, [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(result.rows[0]);
};

const crearProducto = async (req, res) => {
  const { codigo_producto, id_categoria, nombre, descripcion, precio_unitario, unidad_medida, stock_disponible } = req.body;
  const result = await pool.query(
    `INSERT INTO productos (codigo_producto, id_categoria, nombre, descripcion, precio_unitario, unidad_medida, stock_disponible)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6,'unidad'),COALESCE($7,0)) RETURNING *`,
    [codigo_producto ?? null, id_categoria ?? null, nombre, descripcion ?? null, precio_unitario,
     unidad_medida ?? null, stock_disponible ?? null]);
  await registrar(req, 'CREAR', 'productos', result.rows[0].id_producto);
  res.status(201).json(result.rows[0]);
};

const actualizarProducto = async (req, res) => {
  const { id } = req.params;
  const b = req.body;
  const anterior = await pool.query('SELECT precio_unitario FROM productos WHERE id_producto = $1', [id]);
  if (anterior.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
  const result = await pool.query(
    `UPDATE productos SET
       nombre = COALESCE($1, nombre), descripcion = COALESCE($2, descripcion),
       precio_unitario = COALESCE($3, precio_unitario), unidad_medida = COALESCE($4, unidad_medida),
       stock_disponible = COALESCE($5, stock_disponible), activo = COALESCE($6, activo),
       id_categoria = COALESCE($7, id_categoria)
     WHERE id_producto = $8 RETURNING *`,
    [b.nombre, b.descripcion, b.precio_unitario, b.unidad_medida, b.stock_disponible, b.activo, b.id_categoria, id]);
  // Los cambios de precio quedan auditados con valor anterior y nuevo.
  const detalle = { campos: Object.keys(b) };
  if (b.precio_unitario !== undefined) {
    detalle.precio_anterior = anterior.rows[0].precio_unitario;
    detalle.precio_nuevo = result.rows[0].precio_unitario;
  }
  await registrar(req, 'ACTUALIZAR', 'productos', Number(id), detalle);
  res.json(result.rows[0]);
};

module.exports = { getProductos, getCategorias, getProductoById, crearProducto, actualizarProducto };
