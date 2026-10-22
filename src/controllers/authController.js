const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const env = require('../config/env');
const QRCode = require('qrcode');
const { registrar } = require('../utils/bitacora');
const totp = require('../utils/totp');

// Hash ficticio: si el correo no existe igual se ejecuta bcrypt,
// así el tiempo de respuesta no revela qué correos están registrados.
const HASH_FICTICIO = bcrypt.hashSync('usuario-inexistente-mafry', 12);

// Token de acceso: solo lleva id, rol, tipo y versión (nada sensible). Expira en 8 h (una jornada).
// "ver" permite revocarlo: al cerrar sesión o cambiar la contraseña se incrementa version_token.
function emitirToken(usuario) {
  return jwt.sign({ sub: usuario.id_usuario, rol: usuario.rol, typ: 'acceso', ver: usuario.version_token }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: env.JWT_ISSUER,
  });
}

function datosPublicos(usuario) {
  return {
    id_usuario: usuario.id_usuario,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    correo: usuario.correo,
    rol: usuario.rol,
    id_vendedor: usuario.id_vendedor,
    codigo_vendedor: usuario.codigo_vendedor,
    zona_asignada: usuario.zona_asignada,
    mfa_activo: usuario.mfa_activo,
  };
}

// Suma un intento fallido y bloquea la cuenta al llegar al máximo (contraseña o código MFA).
async function registrarFallo(req, usuario, motivo) {
  const intentos = usuario.intentos_fallidos + 1;
  const bloquear = intentos >= env.LOGIN_MAX_INTENTOS;
  await pool.query(
    `UPDATE usuarios
        SET intentos_fallidos = $1,
            bloqueado_hasta = CASE WHEN $2 THEN now() + ($3 || ' minutes')::interval ELSE bloqueado_hasta END
      WHERE id_usuario = $4`,
    [bloquear ? 0 : intentos, bloquear, String(env.LOGIN_BLOQUEO_MIN), usuario.id_usuario]
  );
  await registrar(req, bloquear ? 'CUENTA_BLOQUEADA' : motivo, 'usuarios', usuario.id_usuario, { intentos }, usuario.id_usuario);
}

async function completarLogin(req, res, usuario, conMfa) {
  await pool.query(
    'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = now() WHERE id_usuario = $1',
    [usuario.id_usuario]
  );
  await registrar(req, 'LOGIN_OK', 'usuarios', usuario.id_usuario, conMfa ? { mfa: true } : null, usuario.id_usuario);
  res.json({ token: emitirToken(usuario), usuario: datosPublicos(usuario) });
}

const CONSULTA_USUARIO = `SELECT u.*, v.id_vendedor, v.codigo_vendedor, v.zona_asignada
                            FROM usuarios u
                            LEFT JOIN vendedores v ON v.id_usuario = u.id_usuario`;

const bloqueada = (u) => u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date();

const login = async (req, res) => {
  const { correo, contrasena } = req.body;

  const { rows } = await pool.query(`${CONSULTA_USUARIO} WHERE lower(u.correo) = lower($1)`, [correo]);
  const usuario = rows[0];

  // Cuenta bloqueada temporalmente por intentos fallidos
  if (usuario && bloqueada(usuario)) {
    await registrar(req, 'LOGIN_BLOQUEADO', 'usuarios', usuario.id_usuario, null, usuario.id_usuario);
    return res.status(423).json({ error: 'Cuenta bloqueada temporalmente por intentos fallidos. Intente más tarde.' });
  }

  const passwordValida = await bcrypt.compare(contrasena, usuario ? usuario.contrasena_hash : HASH_FICTICIO);

  if (!usuario || !usuario.activo || !passwordValida) {
    if (usuario) await registrarFallo(req, usuario, 'LOGIN_FALLIDO');
    else await registrar(req, 'LOGIN_FALLIDO', 'usuarios', null, { motivo: 'correo no registrado' });
    // Mismo mensaje para correo inexistente o contraseña incorrecta (no se enumeran usuarios)
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  // Segundo factor: si la cuenta tiene MFA, la contraseña sola no basta.
  // Se entrega un token intermedio de 5 minutos que SOLO sirve para /api/auth/mfa/verificar.
  if (usuario.mfa_activo) {
    const tokenMfa = jwt.sign({ sub: usuario.id_usuario, typ: 'mfa', ver: usuario.version_token }, env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: `${env.MFA_TOKEN_MIN}m`,
      issuer: env.JWT_ISSUER,
    });
    await registrar(req, 'LOGIN_CONTRASENA_OK_MFA_PENDIENTE', 'usuarios', usuario.id_usuario, null, usuario.id_usuario);
    return res.json({ mfa_requerido: true, token_mfa: tokenMfa });
  }

  await completarLogin(req, res, usuario, false);
};

// Paso 2 del inicio de sesión con MFA: token intermedio + código de 6 dígitos.
const verificarMfa = async (req, res) => {
  const { token_mfa: tokenMfa, codigo } = req.body;
  let payload;
  try {
    payload = jwt.verify(tokenMfa, env.JWT_SECRET, { algorithms: ['HS256'], issuer: env.JWT_ISSUER });
  } catch {
    return res.status(401).json({ error: 'El paso de verificación expiró. Ingrese de nuevo.' });
  }
  if (payload.typ !== 'mfa') return res.status(401).json({ error: 'Token no válido para este paso' });

  const { rows } = await pool.query(`${CONSULTA_USUARIO} WHERE u.id_usuario = $1`, [payload.sub]);
  const usuario = rows[0];
  if (!usuario || !usuario.activo || !usuario.mfa_activo || usuario.version_token !== payload.ver) {
    return res.status(401).json({ error: 'El paso de verificación expiró. Ingrese de nuevo.' });
  }
  if (bloqueada(usuario)) {
    await registrar(req, 'LOGIN_BLOQUEADO', 'usuarios', usuario.id_usuario, { paso: 'mfa' }, usuario.id_usuario);
    return res.status(423).json({ error: 'Cuenta bloqueada temporalmente por intentos fallidos. Intente más tarde.' });
  }

  const contador = totp.verificar(totp.descifrar(usuario.mfa_secreto), codigo);
  // Un código ya usado no se acepta otra vez (evita reutilizar un código interceptado).
  if (contador === null || (usuario.mfa_ultimo_contador !== null && contador <= Number(usuario.mfa_ultimo_contador))) {
    await registrarFallo(req, usuario, 'MFA_FALLIDO');
    return res.status(401).json({ error: 'Código de verificación incorrecto' });
  }
  await pool.query('UPDATE usuarios SET mfa_ultimo_contador = $1 WHERE id_usuario = $2', [contador, usuario.id_usuario]);
  await completarLogin(req, res, usuario, true);
};

// Cierre de sesión en el servidor: invalida TODOS los tokens emitidos a este usuario.
const logout = async (req, res) => {
  await pool.query('UPDATE usuarios SET version_token = version_token + 1 WHERE id_usuario = $1', [req.usuario.id_usuario]);
  await registrar(req, 'LOGOUT', 'usuarios', req.usuario.id_usuario);
  res.json({ mensaje: 'Sesión cerrada' });
};

const perfil = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id_usuario, u.nombre, u.apellido, u.correo, u.rol, u.ultimo_acceso, u.mfa_activo,
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
  // Cambiar la contraseña cierra las demás sesiones abiertas; esta sesión recibe un token nuevo.
  const act = await pool.query(
    `UPDATE usuarios SET contrasena_hash = $1, version_token = version_token + 1
      WHERE id_usuario = $2 RETURNING id_usuario, rol, version_token`, [hash, req.usuario.id_usuario]);
  await registrar(req, 'CAMBIO_CONTRASENA', 'usuarios', req.usuario.id_usuario);
  res.json({ mensaje: 'Contraseña actualizada', token: emitirToken(act.rows[0]) });
};

// ---------- Configuración del segundo factor (solo administradores) ----------

// 1) Genera un secreto nuevo y lo devuelve como QR para escanearlo con la app autenticadora.
//    Queda "pendiente" hasta que el usuario demuestre que lo configuró (paso 2).
const configurarMfa = async (req, res) => {
  const { rows } = await pool.query('SELECT correo, mfa_activo FROM usuarios WHERE id_usuario = $1', [req.usuario.id_usuario]);
  if (rows[0].mfa_activo) return res.status(409).json({ error: 'La verificación en dos pasos ya está activa' });
  const secreto = totp.generarSecreto();
  await pool.query('UPDATE usuarios SET mfa_secreto_pendiente = $1 WHERE id_usuario = $2', [totp.cifrar(secreto), req.usuario.id_usuario]);
  const uri = totp.uriOtpauth(secreto, rows[0].correo);
  await registrar(req, 'MFA_CONFIGURACION_INICIADA', 'usuarios', req.usuario.id_usuario);
  res.json({ secreto, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) });
};

// 2) Activa el MFA solo si el código generado por el teléfono es correcto.
const activarMfa = async (req, res) => {
  const { rows } = await pool.query('SELECT mfa_activo, mfa_secreto_pendiente FROM usuarios WHERE id_usuario = $1', [req.usuario.id_usuario]);
  const u = rows[0];
  if (u.mfa_activo) return res.status(409).json({ error: 'La verificación en dos pasos ya está activa' });
  if (!u.mfa_secreto_pendiente) return res.status(400).json({ error: 'Primero genere el código QR' });
  const contador = totp.verificar(totp.descifrar(u.mfa_secreto_pendiente), req.body.codigo);
  if (contador === null) {
    await registrar(req, 'MFA_ACTIVACION_FALLIDA', 'usuarios', req.usuario.id_usuario);
    return res.status(400).json({ error: 'Código incorrecto. Revise la hora del teléfono e intente de nuevo.' });
  }
  await pool.query(
    `UPDATE usuarios SET mfa_activo = true, mfa_secreto = mfa_secreto_pendiente, mfa_secreto_pendiente = NULL,
            mfa_ultimo_contador = $1 WHERE id_usuario = $2`, [contador, req.usuario.id_usuario]);
  await registrar(req, 'MFA_ACTIVADO', 'usuarios', req.usuario.id_usuario);
  res.json({ mensaje: 'Verificación en dos pasos activada' });
};

// 3) Desactivar exige la contraseña Y un código vigente (alguien con la sesión abierta no basta).
const desactivarMfa = async (req, res) => {
  const { rows } = await pool.query('SELECT contrasena_hash, mfa_activo, mfa_secreto FROM usuarios WHERE id_usuario = $1', [req.usuario.id_usuario]);
  const u = rows[0];
  if (!u.mfa_activo) return res.status(400).json({ error: 'La verificación en dos pasos no está activa' });
  const okPass = await bcrypt.compare(req.body.contrasena, u.contrasena_hash);
  const okCodigo = totp.verificar(totp.descifrar(u.mfa_secreto), req.body.codigo) !== null;
  if (!okPass || !okCodigo) {
    await registrar(req, 'MFA_DESACTIVACION_FALLIDA', 'usuarios', req.usuario.id_usuario);
    return res.status(400).json({ error: 'Contraseña o código incorrecto' });
  }
  await pool.query(
    `UPDATE usuarios SET mfa_activo = false, mfa_secreto = NULL, mfa_ultimo_contador = NULL,
            version_token = version_token + 1 WHERE id_usuario = $1`, [req.usuario.id_usuario]);
  await registrar(req, 'MFA_DESACTIVADO', 'usuarios', req.usuario.id_usuario);
  res.json({ mensaje: 'Verificación en dos pasos desactivada. Ingrese de nuevo.' });
};

module.exports = { login, verificarMfa, logout, perfil, cambiarContrasena, configurarMfa, activarMfa, desactivarMfa, emitirToken };
