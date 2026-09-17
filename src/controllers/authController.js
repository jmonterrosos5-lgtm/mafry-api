const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const login = async (req, res) => {
  const { correo, contrasena } = req.body;

  if (!correo || !contrasena) {
    return res.status(400).json({ error: 'Correo y contraseña son requeridos' });
  }

  try {
   const result = await pool.query(
  `SELECT u.*, v.id_vendedor, v.codigo_vendedor, v.zona_asignada
   FROM usuarios u
   LEFT JOIN vendedores v ON v.id_usuario = u.id_usuario
   WHERE u.correo = $1 AND u.activo = true`,
  [correo]
);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const usuario = result.rows[0];
    const passwordValida = await bcrypt.compare(contrasena, usuario.contrasena_hash);

    if (!passwordValida) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id_usuario: usuario.id_usuario, rol: usuario.rol, id_vendedor: usuario.id_vendedor },
      'mafry_jwt_secret_2026',
      { expiresIn: '8h' }
    );

    await pool.query(
  'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = $1',
  [usuario.id_usuario]
);

    res.json({
      token,
      usuario: {
        id_usuario: usuario.id_usuario,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        correo: usuario.correo,
        rol: usuario.rol,
        id_vendedor: usuario.id_vendedor,
        codigo_vendedor: usuario.codigo_vendedor,
        zona_asignada: usuario.zona_asignada
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { login };