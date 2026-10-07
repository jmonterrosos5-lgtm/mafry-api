// Pruebas de controles transversales: cabeceras, errores, bitácora, disponibilidad
const { api, token } = require('./helpers');
const pool = require('../src/config/db');

afterAll(() => pool.end());

describe('Cabeceras y configuración HTTP', () => {
  test('helmet aplica cabeceras de seguridad y oculta la tecnología', async () => {
    const res = await api().get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toMatch(/max-age/);
    expect(res.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);
    expect(res.headers['x-request-id']).toBeDefined();
  });

  test('CORS no autoriza orígenes desconocidos', async () => {
    const res = await api().get('/health').set('Origin', 'https://sitio-malicioso.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('health check reporta la base de datos', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.bd).toBe('ok');
  });
});

describe('Manejo de errores', () => {
  test('JSON mal formado → 400 sin stack trace', async () => {
    const res = await api().post('/api/auth/login').set('Content-Type', 'application/json').send('{"correo":');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js/);
  });

  test('cuerpo mayor a 100 KB → 413', async () => {
    const res = await api().post('/api/auth/login').send({ correo: 'a@b.com', contrasena: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
  });

  test('ruta inexistente → 404 genérico', async () => {
    const res = await api().get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Recurso no encontrado' });
  });

  test('registro duplicado → 409 sin exponer detalles de PostgreSQL', async () => {
    const adm = await token('admin');
    const res = await api().post('/api/vendedores').set('Authorization', `Bearer ${adm}`).send({
      nombre: 'Dup', apellido: 'Licado', correo: 'kevin.garcia@mafry.test', contrasena: 'ClaveSegura2026', codigo_vendedor: 'VEN-050',
    });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toMatch(/duplicate key|usuarios_correo_key/);
  });
});

describe('Bitácora de auditoría', () => {
  test('los inicios de sesión quedan registrados con IP', async () => {
    await token('kevin');
    const r = await pool.query("SELECT ip FROM bitacora WHERE accion = 'LOGIN_OK' ORDER BY id_bitacora DESC LIMIT 1");
    expect(r.rows[0].ip).toBeTruthy();
  });

  test('la bitácora no se puede modificar ni borrar (trigger en la BD)', async () => {
    await expect(pool.query('DELETE FROM bitacora')).rejects.toThrow(/solo inserción/);
    await expect(pool.query("UPDATE bitacora SET accion = 'X'")).rejects.toThrow(/solo inserción/);
  });
});

describe('Panel web', () => {
  test('el panel se sirve desde /admin', async () => {
    const res = await api().get('/admin/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/MAFRY/);
  });
});
