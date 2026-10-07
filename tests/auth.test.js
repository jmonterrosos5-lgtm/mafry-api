// Pruebas de autenticación y sesiones
const jwt = require('jsonwebtoken');
const { api, token, CRED } = require('./helpers');
const pool = require('../src/config/db');

afterAll(() => pool.end());

describe('Autenticación', () => {
  test('login correcto devuelve token JWT y datos del usuario sin el hash', async () => {
    const res = await api().post('/api/auth/login').send(CRED.kevin);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.usuario.rol).toBe('vendedor');
    expect(res.body.usuario.contrasena_hash).toBeUndefined();
    const payload = jwt.decode(res.body.token);
    expect(payload.iss).toBe('mafry-api');
    expect(payload.exp - payload.iat).toBe(8 * 3600); // la sesión expira en 8 horas
  });

  test('contraseña incorrecta y correo inexistente responden el mismo mensaje (sin enumeración)', async () => {
    const a = await api().post('/api/auth/login').send({ correo: CRED.diego.correo, contrasena: 'incorrecta123' });
    const b = await api().post('/api/auth/login').send({ correo: 'nadie@mafry.test', contrasena: 'incorrecta123' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  test('valida el formato de entrada (400)', async () => {
    const res = await api().post('/api/auth/login').send({ correo: 'no-es-correo', contrasena: '' });
    expect(res.status).toBe(400);
    expect(res.body.campos.map((c) => c.campo)).toEqual(expect.arrayContaining(['correo', 'contrasena']));
  });

  test('intento de inyección SQL en el login no da acceso', async () => {
    const res = await api().post('/api/auth/login').send({ correo: "admin@mafry.test' OR '1'='1", contrasena: "' OR '1'='1" });
    expect([400, 401]).toContain(res.status);
    expect(res.body.token).toBeUndefined();
  });

  test('la cuenta se bloquea tras 5 intentos fallidos (423) y queda en bitácora', async () => {
    // Usuario desechable para no afectar a los demás casos
    const adm = await token('admin');
    await api().post('/api/vendedores').set('Authorization', `Bearer ${adm}`).send({
      nombre: 'Prueba', apellido: 'Bloqueo', correo: 'bloqueo@mafry.test',
      contrasena: 'ClaveSegura2026', codigo_vendedor: 'VEN-099',
    }).expect(201);

    for (let i = 0; i < 5; i++) {
      await api().post('/api/auth/login').send({ correo: 'bloqueo@mafry.test', contrasena: 'equivocada1' }).expect(401);
    }
    const bloqueado = await api().post('/api/auth/login').send({ correo: 'bloqueo@mafry.test', contrasena: 'ClaveSegura2026' });
    expect(bloqueado.status).toBe(423);

    const bit = await pool.query("SELECT accion FROM bitacora WHERE accion IN ('CUENTA_BLOQUEADA','LOGIN_BLOQUEADO')");
    expect(bit.rows.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Sesiones y tokens', () => {
  test('sin token → 401', async () => {
    expect((await api().get('/api/pedidos')).status).toBe(401);
  });

  test('token manipulado o firmado con otra clave → 401', async () => {
    const falso = jwt.sign({ sub: 1, rol: 'admin' }, 'clave-del-atacante-que-no-es-la-real-123456', { issuer: 'mafry-api' });
    expect((await api().get('/api/vendedores').set('Authorization', `Bearer ${falso}`)).status).toBe(401);
  });

  test('token con algoritmo "none" es rechazado', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: 1, rol: 'admin', iss: 'mafry-api' })).toString('base64url');
    const res = await api().get('/api/vendedores').set('Authorization', `Bearer ${header}.${body}.`);
    expect(res.status).toBe(401);
  });

  test('token expirado → 401', async () => {
    const expirado = jwt.sign({ sub: 1, rol: 'admin' }, process.env.JWT_SECRET, { issuer: 'mafry-api', expiresIn: -10 });
    expect((await api().get('/api/admin/dashboard').set('Authorization', `Bearer ${expirado}`)).status).toBe(401);
  });

  test('un usuario desactivado pierde el acceso aunque su token no haya expirado', async () => {
    const adm = await token('admin');
    const nuevo = await api().post('/api/vendedores').set('Authorization', `Bearer ${adm}`).send({
      nombre: 'Temporal', apellido: 'Baja', correo: 'baja@mafry.test',
      contrasena: 'ClaveSegura2026', codigo_vendedor: 'VEN-098',
    }).expect(201);
    const t = (await api().post('/api/auth/login').send({ correo: 'baja@mafry.test', contrasena: 'ClaveSegura2026' })).body.token;
    expect((await api().get('/api/pedidos').set('Authorization', `Bearer ${t}`)).status).toBe(200);

    await api().put(`/api/vendedores/${nuevo.body.id_vendedor}`).set('Authorization', `Bearer ${adm}`).send({ activo: false }).expect(200);
    expect((await api().get('/api/pedidos').set('Authorization', `Bearer ${t}`)).status).toBe(401);
  });

  test('política de contraseñas al crear usuario (mínimo 10, letra y número)', async () => {
    const adm = await token('admin');
    const res = await api().post('/api/vendedores').set('Authorization', `Bearer ${adm}`).send({
      nombre: 'Débil', apellido: 'Clave', correo: 'debil@mafry.test', contrasena: '123456', codigo_vendedor: 'VEN-097',
    });
    expect(res.status).toBe(400);
    expect(res.body.campos[0].campo).toBe('contrasena');
  });

  test('las contraseñas se guardan con bcrypt (nunca en texto plano)', async () => {
    const r = await pool.query("SELECT contrasena_hash FROM usuarios WHERE correo = 'kevin.garcia@mafry.test'");
    expect(r.rows[0].contrasena_hash).toMatch(/^\$2[aby]\$12\$/);
    expect(r.rows[0].contrasena_hash).not.toContain(CRED.kevin.contrasena);
  });
});
