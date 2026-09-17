const pool = require('../config/db');

const getVisitas = async (req, res) => {
  try {
    let query, params;
    if (req.usuario.rol === 'admin') {
      query = 'SELECT v.*, c.nombre_negocio, u.nombre AS nombre_vendedor, u.apellido AS apellido_vendedor FROM visitas v LEFT JOIN clientes c ON c.id_cliente = v.id_cliente LEFT JOIN vendedores vend ON vend.id_vendedor = v.id_vendedor LEFT JOIN usuarios u ON u.id_usuario = vend.id_usuario ORDER BY v.fecha_visita DESC';
      params = [];
    } else {
      query = 'SELECT v.*, c.nombre_negocio FROM visitas v LEFT JOIN clientes c ON c.id_cliente = v.id_cliente WHERE v.id_vendedor = $1 ORDER BY v.fecha_visita DESC';
      params = [req.usuario.id_vendedor];
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener visitas' });
  }
};

const getVisitaById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT v.*, c.nombre_negocio FROM visitas v LEFT JOIN clientes c ON c.id_cliente = v.id_cliente WHERE v.id_visita = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Visita no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener visita' });
  }
};

const crearVisita = async (req, res) => {
  try {
    const { id_cliente, id_ruta, fecha_visita, hora_inicio, hora_fin, latitud, longitud, observaciones, estado } = req.body;
    if (!id_cliente || !fecha_visita) return res.status(400).json({ error: 'id_cliente y fecha_visita son requeridos' });
    const result = await pool.query('INSERT INTO visitas (id_vendedor, id_cliente, id_ruta, fecha_visita, hora_inicio, hora_fin, latitud, longitud, observaciones, estado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [req.usuario.id_vendedor, id_cliente, id_ruta, fecha_visita, hora_inicio, hora_fin, latitud, longitud, observaciones, estado || 'pendiente']);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear visita' });
  }
};

const actualizarVisita = async (req, res) => {
  try {
    const { id } = req.params;
    const { hora_fin, latitud, longitud, observaciones, estado } = req.body;
    const result = await pool.query('UPDATE visitas SET hora_fin=COALESCE($1,hora_fin), latitud=COALESCE($2,latitud), longitud=COALESCE($3,longitud), observaciones=COALESCE($4,observaciones), estado=COALESCE($5,estado) WHERE id_visita=$6 RETURNING *', [hora_fin, latitud, longitud, observaciones, estado, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Visita no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar visita' });
  }
};

module.exports = { getVisitas, getVisitaById, crearVisita, actualizarVisita };
