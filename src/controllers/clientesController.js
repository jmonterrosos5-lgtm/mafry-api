const pool = require('../config/db');

const getClientes = async (req, res) => {
  try {
    let query, params;

    if (req.usuario.rol === 'admin') {
      query = 'SELECT id_cliente, nombre_negocio, nombre_contacto, telefono, direccion, latitud, longitud, tipo_cliente, activo, fecha_registro FROM clientes ORDER BY nombre_negocio';
      params = [];
    } else {
      query = 'SELECT DISTINCT c.id_cliente, c.nombre_negocio, c.nombre_contacto, c.telefono, c.direccion, c.latitud, c.longitud, c.tipo_cliente, c.activo, c.fecha_registro FROM clientes c INNER JOIN visitas v ON v.id_cliente = c.id_cliente WHERE v.id_vendedor = $1 ORDER BY c.nombre_negocio';
      params = [req.usuario.id_vendedor];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
};

const getClienteById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id_cliente, nombre_negocio, nombre_contacto, telefono, direccion, latitud, longitud, tipo_cliente, activo, fecha_registro FROM clientes WHERE id_cliente = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener cliente' });
  }
};

const crearCliente = async (req, res) => {
  try {
    const { nombre_negocio, nombre_contacto, telefono, direccion, latitud, longitud, tipo_cliente } = req.body;

    if (!nombre_negocio) {
      return res.status(400).json({ error: 'Nombre del negocio es requerido' });
    }

    const result = await pool.query(
      'INSERT INTO clientes (nombre_negocio, nombre_contacto, telefono, direccion, latitud, longitud, tipo_cliente) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [nombre_negocio, nombre_contacto, telefono, direccion, latitud, longitud, tipo_cliente]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear cliente' });
  }
};

const actualizarCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_negocio, nombre_contacto, telefono, direccion, latitud, longitud, tipo_cliente, activo } = req.body;

    const result = await pool.query(
      'UPDATE clientes SET nombre_negocio = COALESCE($1, nombre_negocio), nombre_contacto = COALESCE($2, nombre_contacto), telefono = COALESCE($3, telefono), direccion = COALESCE($4, direccion), latitud = COALESCE($5, latitud), longitud = COALESCE($6, longitud), tipo_cliente = COALESCE($7, tipo_cliente), activo = COALESCE($8, activo) WHERE id_cliente = $9 RETURNING *',
      [nombre_negocio, nombre_contacto, telefono, direccion, latitud, longitud, tipo_cliente, activo, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar cliente' });
  }
};

module.exports = { getClientes, getClienteById, crearCliente, actualizarCliente };