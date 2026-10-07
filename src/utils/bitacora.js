const pool = require('../config/db');

// Registro de auditoría (tabla bitacora, solo inserción: la BD bloquea UPDATE/DELETE).
async function registrar(req, accion, entidad = null, idEntidad = null, detalle = null, idUsuario = null) {
  try {
    await pool.query(
      `INSERT INTO bitacora (id_usuario, accion, entidad, id_entidad, ip, detalle)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        idUsuario ?? (req.usuario ? req.usuario.id_usuario : null),
        accion,
        entidad,
        idEntidad,
        req.ip || null,
        detalle ? JSON.stringify(detalle) : null,
      ]
    );
  } catch (err) {
    // La auditoría nunca debe tumbar la operación principal, pero sí dejar rastro.
    console.error('[bitacora] No se pudo registrar:', err.message);
  }
}

module.exports = { registrar };
