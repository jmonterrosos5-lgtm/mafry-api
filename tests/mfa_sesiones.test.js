// Pruebas de la verificación en dos pasos (MFA/TOTP) y de la revocación de sesiones.
// Cada control tiene una prueba positiva (funciona para el usuario legítimo)
// y pruebas negativas (bloquea al atacante).
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { api, token } = require('./helpers');
const pool = require('../src/config/db');
const totp = require('../src/utils/totp');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const ADMIN2 = { correo: 'admin.mfa@mafry.test', contrasena: 'AdminMfa2026x' };
const VEND = { correo: 'sesion.prueba@mafry.test', contrasena: 'Vendedor2026x' };

let secreto;
const login = (cred) => api().post('/api/auth/login').send(cred);

beforeAll(async () => {
  const hash = await bcrypt.hash(ADMIN2.contrasena, 12);
  await pool.query(`INSERT INTO usuarios (nombre, apellido, correo, contrasena_hash, rol)
                    VALUES ('Admin', 'MFA', $1, $2, 'admin')`, [ADMIN2.correo, hash]);
  const adm = await token('admin');
  await api().post('/api/vendedores').set(auth(adm)).send({
    nombre: 'Sesión', apellido: 'Prueba', correo: VEND.correo, contrasena: VEND.contrasena, codigo_vendedor: 'VEN-090',
  }).expect(201);
});
afterAll(() => pool.end());

describe('Verificación en dos pasos (MFA) para administradores', () => {
  let t;

  test('un vendedor no puede configurar MFA en el panel (403)', async () => {
    const tv = (await login(VEND)).body.token;
    expect((await api().post('/api/auth/mfa/configurar').set(auth(tv))).status).toBe(403);
  });

  test('el admin genera el QR; el secreto queda cifrado en la BD (nunca en claro)', async () => {
    t = (await login(ADMIN2).expect(200)).body.token;
    const r = await api().post('/api/auth/mfa/configurar').set(auth(t)).expect(200);
    expect(r.body.qr).toMatch(/^data:image\/png;base64,/);
    expect(r.body.uri).toMatch(/^otpauth:\/\/totp\/MAFRY/);
    secreto = r.body.secreto;
    const bd = await pool.query('SELECT mfa_secreto_pendiente FROM usuarios WHERE correo = $1', [ADMIN2.correo]);
    expect(bd.rows[0].mfa_secreto_pendiente).toMatch(/^v1\./);
    expect(bd.rows[0].mfa_secreto_pendiente).not.toContain(secreto);
  });

  test('no se activa con un código incorrecto', async () => {
    const r = await api().post('/api/auth/mfa/activar').set(auth(t)).send({ codigo: '000000' });
    expect(r.status).toBe(400);
  });

  test('se activa con el código correcto del autenticador', async () => {
    const codigo = totp.codigoEn(secreto, totp.contadorActual() - 1);
    await api().post('/api/auth/mfa/activar').set(auth(t)).send({ codigo }).expect(200);
  });

  test('con MFA activo, la contraseña sola NO entrega token de acceso', async () => {
    const r = await login(ADMIN2).expect(200);
    expect(r.body.mfa_requerido).toBe(true);
    expect(r.body.token).toBeUndefined();
    // El token intermedio no abre la API
    expect((await api().get('/api/admin/dashboard').set(auth(r.body.token_mfa))).status).toBe(401);
  });

  test('código incorrecto en el segundo paso → 401 y queda en bitácora', async () => {
    const { token_mfa: tm } = (await login(ADMIN2)).body;
    expect((await api().post('/api/auth/mfa/verificar').send({ token_mfa: tm, codigo: '123456' })).status).toBe(401);
    const b = await pool.query("SELECT 1 FROM bitacora WHERE accion = 'MFA_FALLIDO' LIMIT 1");
    expect(b.rowCount).toBe(1);
  });

  test('contraseña + código correcto → acceso al panel', async () => {
    const { token_mfa: tm } = (await login(ADMIN2)).body;
    const codigo = totp.codigoEn(secreto, totp.contadorActual());
    const r = await api().post('/api/auth/mfa/verificar').send({ token_mfa: tm, codigo }).expect(200);
    expect((await api().get('/api/admin/dashboard').set(auth(r.body.token))).status).toBe(200);
  });

  test('el mismo código no se puede reutilizar (anti-repetición)', async () => {
    const { token_mfa: tm } = (await login(ADMIN2)).body;
    const codigo = totp.codigoEn(secreto, totp.contadorActual());
    expect((await api().post('/api/auth/mfa/verificar').send({ token_mfa: tm, codigo })).status).toBe(401);
  });

  test('token intermedio falsificado o con tipo distinto → 401', async () => {
    const falso = jwt.sign({ sub: 1, typ: 'acceso', ver: 0 }, process.env.JWT_SECRET, { issuer: 'mafry-api', expiresIn: '5m' });
    const r = await api().post('/api/auth/mfa/verificar').send({ token_mfa: falso, codigo: '123456' });
    expect(r.status).toBe(401);
  });
});

describe('Revocación de sesiones', () => {
  test('al cerrar sesión, el token deja de funcionar aunque no haya expirado', async () => {
    const t = (await login(VEND).expect(200)).body.token;
    expect((await api().get('/api/pedidos').set(auth(t))).status).toBe(200);
    await api().post('/api/auth/logout').set(auth(t)).expect(200);
    expect((await api().get('/api/pedidos').set(auth(t))).status).toBe(401);
  });

  test('cambiar la contraseña cierra las otras sesiones y entrega un token nuevo', async () => {
    const otraSesion = (await login(VEND)).body.token;
    const actual = (await login(VEND)).body.token;
    const r = await api().post('/api/auth/cambiar-contrasena').set(auth(actual))
      .send({ actual: VEND.contrasena, nueva: 'NuevaClave2026y' }).expect(200);
    expect((await api().get('/api/pedidos').set(auth(otraSesion))).status).toBe(401);
    expect((await api().get('/api/pedidos').set(auth(r.body.token))).status).toBe(200);
  });

  test('tokens emitidos antes de la v2.1 (sin tipo) ya no se aceptan', async () => {
    const viejo = jwt.sign({ sub: 1, rol: 'admin' }, process.env.JWT_SECRET, { issuer: 'mafry-api', expiresIn: '1h' });
    expect((await api().get('/api/admin/dashboard').set(auth(viejo))).status).toBe(401);
  });
});
