const jwt = require('jsonwebtoken');
const env = require('../config/env');
const pool = require('../config/db');

// Autenticación: exige "Authorization: Bearer <token>" con firma, algoritmo y emisor válidos.
// Además confirma en la base de datos que el usuario siga activo
// (si el admin desactiva a un vendedor, su token deja de funcionar de inmediato).
const verificarToken = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const [tipo, token] = authHeader.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
    });
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  const { rows } = await pool.query(
    `SELECT u.id_usuario, u.rol, u.activo, v.id_vendedor
       FROM usuarios u
       LEFT JOIN vendedores v ON v.id_usuario = u.id_usuario AND v.activo = true
      WHERE u.id_usuario = $1`,
    [payload.sub]
  );
  const usuario = rows[0];
  if (!usuario || !usuario.activo) {
    return res.status(401).json({ error: 'Usuario inactivo' });
  }
  if (usuario.rol === 'vendedor' && !usuario.id_vendedor) {
    return res.status(403).json({ error: 'Vendedor no habilitado' });
  }

  req.usuario = {
    id_usuario: usuario.id_usuario,
    rol: usuario.rol,
    id_vendedor: usuario.id_vendedor,
  };
  next();
};

// Autorización por rol (RBAC).
const permitirRoles = (...roles) => (req, res, next) => {
  if (!req.usuario || !roles.includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'No tiene permisos para esta acción' });
  }
  next();
};

const soloAdmin = permitirRoles('admin');
const esAdmin = (req) => req.usuario && req.usuario.rol === 'admin';

module.exports = { verificarToken, permitirRoles, soloAdmin, esAdmin };
