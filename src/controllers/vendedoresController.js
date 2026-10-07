const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { registrar } = require('../utils/bitacora');

const BASE = `SELECT v.id_vendedor, v.codigo_vendedor, v.telefono, v.zona_asignada, v.activo,
                     u.id_usuario, u.nombre, u.apellido, u.correo, u.ultimo_acceso, u.activo AS usuario_activo,
                     (u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > now()) AS bloqueado
                FROM vendedores v JOIN usuarios u ON u.id_usuario = v.id_usuario`;

const getVendedores = async (req, res) => {
  res.json((await pool.query(`${BASE} ORDER BY u.nombre, u.apellido`)).rows);
};

const getVendedorById = async (req, res) => {
  const result = await pool.query(`${BASE} WHERE v.id_vendedor = $1`, [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Vendedor no encontrado' });
  res.json(result.rows[0]);
};

// Alta de vendedor: crea usuario (rol vendedor) + ficha de vendedor en una transacción.
const crearVendedor = async (req, res) => {
  const { nombre, apellido, correo, contrasena, codigo_vendedor, telefono, zona_asignada } = req.body;
  const hash = await bcrypt.hash(contrasena, 12);
  const client = await pool.connect();
  let creado;
  try {
    await client.query('BEGIN');
    const u = await client.query(
      `INSERT INTO usuarios (nombre, apellido, correo, contrasena_hash, rol)
       VALUES ($1,$2,lower($3),$4,'vendedor') RETURNING id_usuario`, [nombre, apellido, correo, hash]);
    creado = (await client.query(
      `INSERT INTO vendedores (id_usuario, codigo_vendedor, telefono, zona_asignada)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [u.rows[0].id_usuario, codigo_vendedor, telefono ?? null, zona_asignada ?? null])).rows[0];
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await registrar(req, 'CREAR_USUARIO', 'vendedores', creado.id_vendedor, { correo: correo.toLowerCase() });
  res.status(201).json((await pool.query(`${BASE} WHERE v.id_vendedor = $1`, [creado.id_vendedor])).rows[0]);
};

const actualizarVendedor = async (req, res) => {
  const { id } = req.params;
  const { telefono, zona_asignada, activo } = req.body;
  const result = await pool.query(
    `UPDATE vendedores SET telefono = COALESCE($1, telefono), zona_asignada = COALESCE($2, zona_asignada),
            activo = COALESCE($3, activo)
      WHERE id_vendedor = $4 RETURNING id_usuario`, [telefono, zona_asignada, activo, id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Vendedor no encontrado' });
  if (activo !== undefined) {
    // Desactivar al vendedor también desactiva su usuario: sus tokens dejan de servir.
    await pool.query('UPDATE usuarios SET activo = $1 WHERE id_usuario = $2', [activo, result.rows[0].id_usuario]);
  }
  await registrar(req, activo === false ? 'DESACTIVAR_USUARIO' : 'ACTUALIZAR', 'vendedores', Number(id), req.body);
  res.json((await pool.query(`${BASE} WHERE v.id_vendedor = $1`, [id])).rows[0]);
};

const desbloquearVendedor = async (req, res) => {
  const result = await pool.query(
    `UPDATE usuarios u SET intentos_fallidos = 0, bloqueado_hasta = NULL
       FROM vendedores v WHERE v.id_usuario = u.id_usuario AND v.id_vendedor = $1 RETURNING u.id_usuario`,
    [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Vendedor no encontrado' });
  await registrar(req, 'DESBLOQUEAR_USUARIO', 'vendedores', Number(req.params.id));
  res.json({ mensaje: 'Usuario desbloqueado' });
};

// Restablecer contraseña (el admin define una temporal que el vendedor debe cambiar).
const restablecerContrasena = async (req, res) => {
  const hash = await bcrypt.hash(req.body.contrasena, 12);
  const result = await pool.query(
    `UPDATE usuarios u SET contrasena_hash = $1, intentos_fallidos = 0, bloqueado_hasta = NULL
       FROM vendedores v WHERE v.id_usuario = u.id_usuario AND v.id_vendedor = $2 RETURNING u.id_usuario`,
    [hash, req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Vendedor no encontrado' });
  await registrar(req, 'RESTABLECER_CONTRASENA', 'vendedores', Number(req.params.id));
  res.json({ mensaje: 'Contraseña restablecida' });
};

module.exports = { getVendedores, getVendedorById, crearVendedor, actualizarVendedor, desbloquearVendedor, restablecerContrasena };
