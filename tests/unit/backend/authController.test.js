/**
 * Pruebas unitarias — Módulo crítico: Autenticación (src/controllers/authController.js)
 * Requerimientos: RF-01 (login), RF-11 (acceso con JWT), RNF-03 (JWT expira a las 8 h).
 *
 * Dobles de prueba usados y justificación:
 *  - db (mock): se controlan las filas que "devuelve" la BD para simular usuario activo,
 *    inactivo, bloqueado o con MFA sin necesitar PostgreSQL.
 *  - bcryptjs (stub): bcrypt con costo 12 tarda ~250 ms por llamada y no es lo que se prueba;
 *    el stub decide si la contraseña "coincide" y permite verificar que se use el hash
 *    ficticio cuando el correo no existe (protección contra enumeración por tiempo).
 *  - utils/totp (stub): los códigos TOTP cambian cada 30 s; el stub fija el resultado para
 *    probar la protección anti-reutilización sin depender del reloj.
 *  - utils/bitacora (spy): se comprueba el evento de auditoría registrado.
 */
jest.mock('../../../src/config/env', () => require('../helpers/envStub'));
jest.mock('../../../src/config/db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../../../src/utils/bitacora', () => ({ registrar: jest.fn() }));
jest.mock('bcryptjs', () => ({
  hashSync: jest.fn(() => 'HASH_FICTICIO'),
  compare: jest.fn(),
  hash: jest.fn(async () => 'HASH_NUEVO'),
}));
jest.mock('../../../src/utils/totp', () => ({
  verificar: jest.fn(),
  descifrar: jest.fn((s) => `plano:${s}`),
  generarSecreto: jest.fn(() => 'SECRETOBASE32'),
  cifrar: jest.fn((s) => `cifrado:${s}`),
  uriOtpauth: jest.fn(() => 'otpauth://totp/MAFRY'),
}));
jest.mock('qrcode', () => ({ toDataURL: jest.fn(async () => 'data:image/png;base64,QR') }));

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../../../src/config/db');
const { registrar } = require('../../../src/utils/bitacora');
const totp = require('../../../src/utils/totp');
const env = require('../helpers/envStub');
const auth = require('../../../src/controllers/authController');
const { filas, resFalso, reqAdmin, reqVendedor } = require('../helpers/dobles');

const usuarioBase = (extra = {}) => ({
  id_usuario: 7, nombre: 'Kevin', apellido: 'García', correo: 'kevin@mafry.test', rol: 'vendedor',
  contrasena_hash: 'HASH_REAL', activo: true, intentos_fallidos: 0, bloqueado_hasta: null,
  mfa_activo: false, mfa_secreto: null, mfa_ultimo_contador: null, version_token: 3,
  id_vendedor: 1, codigo_vendedor: 'VEN-001', zona_asignada: 'Norte', ...extra,
});
const verificarJwt = (t) => jwt.verify(t, env.JWT_SECRET, { issuer: 'mafry-api' });

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockResolvedValue(filas());
});

describe('login', () => {
  test('credenciales válidas sin MFA → 200 con token de acceso y datos públicos', async () => {
    pool.query.mockResolvedValueOnce(filas(usuarioBase()));
    bcrypt.compare.mockResolvedValue(true);
    const res = resFalso();

    await auth.login({ body: { correo: 'kevin@mafry.test', contrasena: 'x' }, ip: '1.1.1.1' }, res);

    const { token, usuario } = res.json.mock.calls[0][0];
    const payload = verificarJwt(token);
    expect(payload).toMatchObject({ sub: 7, rol: 'vendedor', typ: 'acceso', ver: 3 });
    expect(usuario).not.toHaveProperty('contrasena_hash');
    expect(registrar).toHaveBeenCalledWith(expect.anything(), 'LOGIN_OK', 'usuarios', 7, null, 7);
  });

  test('el token de acceso expira exactamente a las 8 horas (RNF-03)', async () => {
    pool.query.mockResolvedValueOnce(filas(usuarioBase()));
    bcrypt.compare.mockResolvedValue(true);
    const res = resFalso();
    await auth.login({ body: { correo: 'k', contrasena: 'x' } }, res);
    const { iat, exp } = verificarJwt(res.json.mock.calls[0][0].token);
    expect(exp - iat).toBe(8 * 60 * 60);
  });

  test('correo inexistente → 401 genérico y se compara contra el hash ficticio (anti-enumeración)', async () => {
    pool.query.mockResolvedValueOnce(filas());
    bcrypt.compare.mockResolvedValue(false);
    const res = resFalso();

    await auth.login({ body: { correo: 'nadie@x.com', contrasena: 'x' } }, res);

    expect(bcrypt.compare).toHaveBeenCalledWith('x', 'HASH_FICTICIO');
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Credenciales inválidas' });
    expect(registrar).toHaveBeenCalledWith(expect.anything(), 'LOGIN_FALLIDO', 'usuarios', null, { motivo: 'correo no registrado' });
  });

  test('contraseña incorrecta → 401 y suma un intento fallido sin bloquear', async () => {
    pool.query.mockResolvedValueOnce(filas(usuarioBase({ intentos_fallidos: 1 })));
    bcrypt.compare.mockResolvedValue(false);
    const res = resFalso();

    await auth.login({ body: { correo: 'k', contrasena: 'mala' } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    const [, params] = pool.query.mock.calls[1];
    expect(params).toEqual([2, false, '15', 7]);
    expect(registrar).toHaveBeenCalledWith(expect.anything(), 'LOGIN_FALLIDO', 'usuarios', 7, { intentos: 2 }, 7);
  });

  test('quinto intento fallido (valor límite) → bloquea la cuenta 15 min', async () => {
    pool.query.mockResolvedValueOnce(filas(usuarioBase({ intentos_fallidos: 4 })));
    bcrypt.compare.mockResolvedValue(false);
    await auth.login({ body: { correo: 'k', contrasena: 'mala' } }, resFalso());

    const [, params] = pool.query.mock.calls[1];
    expect(params).toEqual([0, true, '15', 7]);
    expect(registrar).toHaveBeenCalledWith(expect.anything(), 'CUENTA_BLOQUEADA', 'usuarios', 7, { intentos: 5 }, 7);
  });

  test('cuenta bloqueada → 423 sin evaluar la contraseña', async () => {
    const futuro = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    pool.query.mockResolvedValueOnce(filas(usuarioBase({ bloqueado_hasta: futuro })));
    const res = resFalso();

    await auth.login({ body: { correo: 'k', contrasena: 'x' } }, res);

    expect(res.status).toHaveBeenCalledWith(423);
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('bloqueo ya vencido → permite el ingreso', async () => {
    const pasado = new Date(Date.now() - 60 * 1000).toISOString();
    pool.query.mockResolvedValueOnce(filas(usuarioBase({ bloqueado_hasta: pasado })));
    bcrypt.compare.mockResolvedValue(true);
    const res = resFalso();
    await auth.login({ body: { correo: 'k', contrasena: 'x' } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toHaveProperty('token');
  });

  test('usuario inactivo con contraseña correcta → 401', async () => {
    pool.query.mockResolvedValueOnce(filas(usuarioBase({ activo: false })));
    bcrypt.compare.mockResolvedValue(true);
    const res = resFalso();
    await auth.login({ body: { correo: 'k', contrasena: 'x' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('cuenta con MFA → devuelve token intermedio de tipo "mfa", no token de acceso', async () => {
    pool.query.mockResolvedValueOnce(filas(usuarioBase({ rol: 'admin', mfa_activo: true })));
    bcrypt.compare.mockResolvedValue(true);
    const res = resFalso();

    await auth.login({ body: { correo: 'a', contrasena: 'x' } }, res);

    const cuerpo = res.json.mock.calls[0][0];
    expect(cuerpo.mfa_requerido).toBe(true);
    expect(cuerpo).not.toHaveProperty('token');
    const p = verificarJwt(cuerpo.token_mfa);
    expect(p.typ).toBe('mfa');
    expect(p.exp - p.iat).toBe(5 * 60);
  });
});

describe('verificarMfa', () => {
  const tokenMfa = (extra = {}) => jwt.sign({ sub: 7, typ: 'mfa', ver: 3, ...extra }, env.JWT_SECRET, { issuer: 'mafry-api', expiresIn: '5m' });
  const admin = (extra = {}) => usuarioBase({ rol: 'admin', mfa_activo: true, mfa_secreto: 'S', mfa_ultimo_contador: '100', ...extra });

  test('token intermedio inválido → 401', async () => {
    const res = resFalso();
    await auth.verificarMfa({ body: { token_mfa: 'basura', codigo: '123456' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('un token de acceso no sirve como token intermedio → 401', async () => {
    const res = resFalso();
    await auth.verificarMfa({ body: { token_mfa: tokenMfa({ typ: 'acceso' }), codigo: '123456' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token no válido para este paso' });
  });

  test('código TOTP ya utilizado (contador ≤ último) → 401 y cuenta como intento fallido', async () => {
    pool.query.mockResolvedValueOnce(filas(admin()));
    totp.verificar.mockReturnValue(100);
    const res = resFalso();

    await auth.verificarMfa({ body: { token_mfa: tokenMfa(), codigo: '123456' } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(registrar).toHaveBeenCalledWith(expect.anything(), 'MFA_FALLIDO', 'usuarios', 7, { intentos: 1 }, 7);
  });

  test('código correcto y nuevo → guarda el contador y entrega token de acceso', async () => {
    pool.query.mockResolvedValueOnce(filas(admin()));
    totp.verificar.mockReturnValue(101);
    const res = resFalso();

    await auth.verificarMfa({ body: { token_mfa: tokenMfa(), codigo: '654321' } }, res);

    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('mfa_ultimo_contador = $1'), [101, 7]);
    expect(verificarJwt(res.json.mock.calls[0][0].token).typ).toBe('acceso');
  });

  test('sesión revocada (version_token cambió) → 401', async () => {
    pool.query.mockResolvedValueOnce(filas(admin({ version_token: 4 })));
    const res = resFalso();
    await auth.verificarMfa({ body: { token_mfa: tokenMfa(), codigo: '654321' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(totp.verificar).not.toHaveBeenCalled();
  });
});

describe('sesión y contraseña', () => {
  test('logout incrementa version_token (invalida todos los tokens)', async () => {
    const res = resFalso();
    await auth.logout(reqVendedor(), res);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('version_token = version_token + 1'), [2]);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Sesión cerrada' });
  });

  test('cambiar contraseña con la actual incorrecta → 400 y no se actualiza', async () => {
    pool.query.mockResolvedValueOnce(filas({ contrasena_hash: 'H' }));
    bcrypt.compare.mockResolvedValue(false);
    const res = resFalso();
    await auth.cambiarContrasena(reqVendedor({ body: { actual: 'x', nueva: 'NuevaClave2026' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  test('cambiar contraseña correcta → hash con costo 12 y nuevo token con la versión nueva', async () => {
    pool.query
      .mockResolvedValueOnce(filas({ contrasena_hash: 'H' }))
      .mockResolvedValueOnce(filas({ id_usuario: 2, rol: 'vendedor', version_token: 9 }));
    bcrypt.compare.mockResolvedValue(true);
    const res = resFalso();
    await auth.cambiarContrasena(reqVendedor({ body: { actual: 'x', nueva: 'NuevaClave2026' } }), res);
    expect(bcrypt.hash).toHaveBeenCalledWith('NuevaClave2026', 12);
    expect(verificarJwt(res.json.mock.calls[0][0].token).ver).toBe(9);
  });
});

describe('configuración del MFA', () => {
  test('configurar cuando ya está activo → 409', async () => {
    pool.query.mockResolvedValueOnce(filas({ correo: 'a@a', mfa_activo: true }));
    const res = resFalso();
    await auth.configurarMfa(reqAdmin(), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('configurar → guarda el secreto CIFRADO como pendiente y devuelve el QR', async () => {
    pool.query.mockResolvedValueOnce(filas({ correo: 'a@a', mfa_activo: false }));
    const res = resFalso();
    await auth.configurarMfa(reqAdmin(), res);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('mfa_secreto_pendiente'), ['cifrado:SECRETOBASE32', 1]);
    expect(res.json.mock.calls[0][0].qr).toMatch(/^data:image\/png/);
  });

  test('activar sin haber generado el QR → 400', async () => {
    pool.query.mockResolvedValueOnce(filas({ mfa_activo: false, mfa_secreto_pendiente: null }));
    const res = resFalso();
    await auth.activarMfa(reqAdmin({ body: { codigo: '123456' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('activar con código correcto → mueve el secreto pendiente a activo', async () => {
    pool.query.mockResolvedValueOnce(filas({ mfa_activo: false, mfa_secreto_pendiente: 'P' }));
    totp.verificar.mockReturnValue(200);
    const res = resFalso();
    await auth.activarMfa(reqAdmin({ body: { codigo: '123456' } }), res);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('mfa_secreto = mfa_secreto_pendiente'), [200, 1]);
    expect(res.json).toHaveBeenCalledWith({ mensaje: 'Verificación en dos pasos activada' });
  });

  test('activar con código incorrecto → 400 y se audita el intento', async () => {
    pool.query.mockResolvedValueOnce(filas({ mfa_activo: false, mfa_secreto_pendiente: 'P' }));
    totp.verificar.mockReturnValue(null);
    const res = resFalso();
    await auth.activarMfa(reqAdmin({ body: { codigo: '000000' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(registrar).toHaveBeenCalledWith(expect.anything(), 'MFA_ACTIVACION_FALLIDA', 'usuarios', 1);
  });

  test('desactivar con contraseña y código correctos → revoca sesiones', async () => {
    pool.query.mockResolvedValueOnce(filas({ contrasena_hash: 'H', mfa_activo: true, mfa_secreto: 'S' }));
    bcrypt.compare.mockResolvedValue(true);
    totp.verificar.mockReturnValue(300);
    const res = resFalso();
    await auth.desactivarMfa(reqAdmin({ body: { contrasena: 'x', codigo: '123456' } }), res);
    expect(pool.query.mock.calls[1][0]).toContain('version_token = version_token + 1');
    expect(registrar).toHaveBeenCalledWith(expect.anything(), 'MFA_DESACTIVADO', 'usuarios', 1);
  });

  test('desactivar con código incorrecto → 400 aunque la contraseña sea correcta', async () => {
    pool.query.mockResolvedValueOnce(filas({ contrasena_hash: 'H', mfa_activo: true, mfa_secreto: 'S' }));
    bcrypt.compare.mockResolvedValue(true);
    totp.verificar.mockReturnValue(null);
    const res = resFalso();
    await auth.desactivarMfa(reqAdmin({ body: { contrasena: 'x', codigo: '000000' } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(registrar).toHaveBeenCalledWith(expect.anything(), 'MFA_DESACTIVACION_FALLIDA', 'usuarios', 1);
  });
});
