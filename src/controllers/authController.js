const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const env = require('../config/env');
const { registrar } = require('../utils/bitacora');

// Hash ficticio: si el correo no existe igual se ejecuta bcrypt,
// así el tiempo de respuesta no revela qué correos están registrados.
const HASH_FICTICIO = bcrypt.hashSync('usuario-inexistente-mafry', 12);

const login = async (req, res) => {
  const { correo, contrasena } = req.body;

  const { rows } = await pool.query(
    `SELECT u.*, v.id_vendedor, v.codigo_vendedor, v.zona_asignada
       FROM usuarios u
       LEFT JOIN vendedores v ON v.id_usuario = u.id_usuario
      WHERE lower(u.correo) = lower($1)`,
    [correo]
  );
  const usuario = rows[0];

  // Cuenta bloqueada temporalmente por intentos fallidos
  if (usuario && usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
    await registrar(req, 'LOGIN_BLOQUEADO', 'usuarios', usuario.id_usuario, null, usuario.id_usuario);
    return res.status(423).json({ error: 'Cuenta bloqueada temporalmente por intentos fallidos. Intente más tarde.' });
  }

  const passwordValida = await bcrypt.compare(contrasena, usuario ? usuario.contrasena_hash : HASH_FICTICIO);

  if (!usuario || !usuario.activo || !passwordValida) {
    if (usuario) {
      const intentos = usuario.intentos_fallidos + 1;
      const bloquear = intentos >= env.LOGIN_MAX_INTENTOS;
      await pool.query(
        `UPDATE usuarios
            SET intentos_fallidos = $1,
                bloqueado_hasta = CASE WHEN $2 THEN now() + ($3 || ' minutes')::interval ELSE bloqueado_hasta END
          WHERE id_usuario = $4`,
        [bloquear ? 0 : intentos, bloquear, String(env.LOGIN_BLOQUEO_MIN), usuario.id_usuario]
      );
      await registrar(req, bloquear ? 'CUENTA_BLOQUEADA' : 'LOGIN_FALLIDO', 'usuarios', usuario.id_usuario, { intentos }, usuario.id_usuario);
    } else {
      await registrar(req, 'LOGIN_FALLIDO', 'usuarios', null, { motivo: 'correo no registrado' });
    }
    // Mismo mensaje para correo inexistente o contraseña incorrecta (no se enumeran usuarios)
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  await pool.query(
    'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = now() WHERE id_usuario = $1',
    [usuario.id_usuario]
  );

  // El token solo lleva el id y el rol (nada sensible). Expira en 8 h (una jornada).
  const token = jwt.sign({ sub: usuario.id_usuario, rol: usuario.rol }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: env.JWT_ISSUER,
  });

  await registrar(req, 'LOGIN_OK', 'usuarios', usuario.id_usuario, null, usuario.id_usuario);

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
      zona_asignada: usuario.zona_asignada,
    },
  });
};

const perfil = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id_usuario, u.nombre, u.apellido, u.correo, u.rol, u.ultimo_acceso,
            v.id_vendedor, v.codigo_vendedor, v.zona_asignada
       FROM usuarios u LEFT JOIN vendedores v ON v.id_usuario = u.id_usuario
      WHERE u.id_usuario = $1`,
    [req.usuario.id_usuario]
  );
  res.json(rows[0]);
};

const cambiarContrasena = async (req, res) => {
  const { actual, nueva } = req.body;
  const { rows } = await pool.query('SELECT contrasena_hash FROM usuarios WHERE id_usuario = $1', [req.usuario.id_usuario]);
  if (!(await bcrypt.compare(actual, rows[0].contrasena_hash))) {
    await registrar(req, 'CAMBIO_CONTRASENA_FALLIDO', 'usuarios', req.usuario.id_usuario);
    return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  }
  const hash = await bcrypt.hash(nueva, 12);
  await pool.query('UPDATE usuarios SET contrasena_hash = $1 WHERE id_usuario = $2', [hash, req.usuario.id_usuario]);
  await registrar(req, 'CAMBIO_CONTRASENA', 'usuarios', req.usuario.id_usuario);
  res.json({ mensaje: 'Contraseña actualizada' });
};

module.exports = { login, perfil, cambiarContrasena };
