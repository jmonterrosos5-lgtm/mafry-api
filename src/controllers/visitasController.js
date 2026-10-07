const pool = require('../config/db');
const { esAdmin } = require('../middleware/auth');
const { registrar } = require('../utils/bitacora');
const { FILTRO_VENDEDOR } = require('./clientesController');

const BASE = `SELECT v.*, c.nombre_negocio, u.nombre || ' ' || u.apellido AS vendedor
                FROM visitas v
                LEFT JOIN clientes c ON c.id_cliente = v.id_cliente
                LEFT JOIN vendedores vend ON vend.id_vendedor = v.id_vendedor
                LEFT JOIN usuarios u ON u.id_usuario = vend.id_usuario`;

const getVisitas = async (req, res) => {
  const result = esAdmin(req)
    ? await pool.query(`${BASE} ORDER BY v.fecha_visita DESC, v.id_visita DESC LIMIT 500`)
    : await pool.query(`${BASE} WHERE v.id_vendedor = $1 ORDER BY v.fecha_visita DESC, v.id_visita DESC LIMIT 200`,
        [req.usuario.id_vendedor]);
  res.json(result.rows);
};

const getVisitaById = async (req, res) => {
  const { id } = req.params;
  const result = esAdmin(req)
    ? await pool.query(`${BASE} WHERE v.id_visita = $1`, [id])
    : await pool.query(`${BASE} WHERE v.id_visita = $1 AND v.id_vendedor = $2`, [id, req.usuario.id_vendedor]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Visita no encontrada' });
  res.json(result.rows[0]);
};

const crearVisita = async (req, res) => {
  if (esAdmin(req)) return res.status(403).json({ error: 'Las visitas las registra el vendedor' });
  const { id_cliente, id_ruta, fecha_visita, hora_inicio, hora_fin, latitud, longitud, observaciones, estado } = req.body;

  // El vendedor solo puede visitar clientes que tiene asignados/visitados.
  const cli = await pool.query(`SELECT 1 FROM clientes c WHERE c.id_cliente = $2 AND c.activo AND ${FILTRO_VENDEDOR}`,
    [req.usuario.id_vendedor, id_cliente]);
  if (cli.rows.length === 0) return res.status(404).json({ error: 'Cliente no encontrado' });

  const result = await pool.query(
    `INSERT INTO visitas (id_vendedor, id_cliente, id_ruta, fecha_visita, hora_inicio, hora_fin, latitud, longitud, observaciones, estado)
     VALUES ($1,$2,$3,COALESCE($4,CURRENT_DATE),COALESCE($5,LOCALTIME),$6,$7,$8,$9,COALESCE($10,'en_curso')) RETURNING *`,
    [req.usuario.id_vendedor, id_cliente, id_ruta ?? null, fecha_visita ?? null, hora_inicio ?? null,
     hora_fin ?? null, latitud ?? null, longitud ?? null, observaciones ?? null, estado ?? null]
  );
  await registrar(req, 'CREAR', 'visitas', result.rows[0].id_visita);
  res.status(201).json(result.rows[0]);
};

const actualizarVisita = async (req, res) => {
  const { id } = req.params;
  const { hora_fin, latitud, longitud, observaciones, estado } = req.body;
  const params = [hora_fin, latitud, longitud, observaciones, estado, id];
  let filtro = 'id_visita = $6';
  if (!esAdmin(req)) { filtro += ' AND id_vendedor = $7'; params.push(req.usuario.id_vendedor); }
  const result = await pool.query(
    `UPDATE visitas SET hora_fin = COALESCE($1, hora_fin), latitud = COALESCE($2, latitud),
            longitud = COALESCE($3, longitud), observaciones = COALESCE($4, observaciones),
            estado = COALESCE($5, estado)
      WHERE ${filtro} RETURNING *`, params);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Visita no encontrada' });
  await registrar(req, 'ACTUALIZAR', 'visitas', Number(id), { estado });
  res.json(result.rows[0]);
};

module.exports = { getVisitas, getVisitaById, crearVisita, actualizarVisita };
