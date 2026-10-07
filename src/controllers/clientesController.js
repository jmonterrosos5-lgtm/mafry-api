const pool = require('../config/db');
const { esAdmin } = require('../middleware/auth');
const { registrar } = require('../utils/bitacora');

const CAMPOS = `c.id_cliente, c.nombre_negocio, c.nombre_contacto, c.telefono, c.direccion,
                c.latitud, c.longitud, c.tipo_cliente, c.id_vendedor, c.activo, c.fecha_registro`;

// Un vendedor solo ve los clientes asignados a él o que ya visitó.
const FILTRO_VENDEDOR = `(c.id_vendedor = $1 OR EXISTS (
  SELECT 1 FROM visitas vi WHERE vi.id_cliente = c.id_cliente AND vi.id_vendedor = $1))`;

const getClientes = async (req, res) => {
  const result = esAdmin(req)
    ? await pool.query(
        `SELECT ${CAMPOS}, u.nombre || ' ' || u.apellido AS vendedor
           FROM clientes c
           LEFT JOIN vendedores v ON v.id_vendedor = c.id_vendedor
           LEFT JOIN usuarios u ON u.id_usuario = v.id_usuario
          ORDER BY c.nombre_negocio`)
    : await pool.query(
        `SELECT ${CAMPOS} FROM clientes c WHERE c.activo = true AND ${FILTRO_VENDEDOR} ORDER BY c.nombre_negocio`,
        [req.usuario.id_vendedor]);
  res.json(result.rows);
};

const getClienteById = async (req, res) => {
  const { id } = req.params;
  const result = esAdmin(req)
    ? await pool.query(`SELECT ${CAMPOS} FROM clientes c WHERE c.id_cliente = $1`, [id])
    : await pool.query(`SELECT ${CAMPOS} FROM clientes c WHERE c.id_cliente = $2 AND ${FILTRO_VENDEDOR}`,
        [req.usuario.id_vendedor, id]);
  // 404 también cuando existe pero es de otro vendedor (no se revela su existencia)
  if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(result.rows[0]);
};

const crearCliente = async (req, res) => {
  const { nombre_negocio, nombre_contacto, telefono, direccion, latitud, longitud, tipo_cliente } = req.body;
  // Si lo crea un vendedor, queda asignado a él; el admin puede asignar a cualquiera.
  const idVendedor = esAdmin(req) ? req.body.id_vendedor ?? null : req.usuario.id_vendedor;
  const result = await pool.query(
    `INSERT INTO clientes (nombre_negocio, nombre_contacto, telefono, direccion, latitud, longitud, tipo_cliente, id_vendedor)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'tienda'),$8) RETURNING *`,
    [nombre_negocio, nombre_contacto ?? null, telefono ?? null, direccion ?? null,
     latitud ?? null, longitud ?? null, tipo_cliente ?? null, idVendedor]
  );
  await registrar(req, 'CREAR', 'clientes', result.rows[0].id_cliente);
  res.status(201).json(result.rows[0]);
};

const actualizarCliente = async (req, res) => {
  const { id } = req.params;
  const b = req.body;
  const result = await pool.query(
    `UPDATE clientes SET
       nombre_negocio  = COALESCE($1, nombre_negocio),
       nombre_contacto = COALESCE($2, nombre_contacto),
       telefono        = COALESCE($3, telefono),
       direccion       = COALESCE($4, direccion),
       latitud         = COALESCE($5, latitud),
       longitud        = COALESCE($6, longitud),
       tipo_cliente    = COALESCE($7, tipo_cliente),
       activo          = COALESCE($8, activo),
       id_vendedor     = COALESCE($9, id_vendedor)
     WHERE id_cliente = $10 RETURNING *`,
    [b.nombre_negocio, b.nombre_contacto, b.telefono, b.direccion, b.latitud, b.longitud,
     b.tipo_cliente, b.activo, b.id_vendedor, id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
  await registrar(req, 'ACTUALIZAR', 'clientes', Number(id), { campos: Object.keys(b) });
  res.json(result.rows[0]);
};

module.exports = { getClientes, getClienteById, crearCliente, actualizarCliente, FILTRO_VENDEDOR };
