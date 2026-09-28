jest.mock('pg', () => {
  const mockClient = { release: jest.fn() };
  const mockPool = {
    connect: jest.fn().mockResolvedValue(mockClient),
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    end: jest.fn().mockResolvedValue(true),
  };
  return { Pool: jest.fn(() => mockPool) };
});

const request = require('supertest');
const app     = require('../src/app');

const TOKEN_INVALIDO = 'Bearer token_invalido_para_pruebas';

describe('TC-01 al TC-03 | Endpoint raíz GET /', () => {
  test('TC-01 | GET / responde con HTTP 200', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
  });
  test('TC-02 | GET / devuelve campo "mensaje" en el cuerpo', async () => {
    const res = await request(app).get('/');
    expect(res.body).toHaveProperty('mensaje');
    expect(typeof res.body.mensaje).toBe('string');
  });
  test('TC-03 | GET / devuelve campo "version" en el cuerpo', async () => {
    const res = await request(app).get('/');
    expect(res.body).toHaveProperty('version');
    expect(res.body.version).toBe('1.0.0');
  });
});

describe('TC-04 | Manejo de rutas inexistentes', () => {
  test('TC-04 | GET /ruta-que-no-existe devuelve HTTP 404', async () => {
    const res = await request(app).get('/ruta-que-no-existe');
    expect(res.statusCode).toBe(404);
  });
});

describe('TC-05 al TC-07 | Módulo de autenticación /api/auth', () => {
  test('TC-05 | POST /api/auth/login sin cuerpo no devuelve 200', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.statusCode).not.toBe(200);
  });
  test('TC-06 | POST /api/auth/login sin email retorna error de validación', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'clave123' });
    expect([400, 401, 422, 500]).toContain(res.statusCode);
  });
  test('TC-07 | POST /api/auth/login sin password retorna error de validación', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'vendedor@mafry.com' });
    expect([400, 401, 422, 500]).toContain(res.statusCode);
  });
});

describe('TC-08 al TC-10 | Módulo de pedidos /api/pedidos', () => {
  test('TC-08 | GET /api/pedidos sin token retorna 401', async () => {
    const res = await request(app).get('/api/pedidos');
    expect(res.statusCode).toBe(401);
  });
  test('TC-09 | POST /api/pedidos sin token retorna 401', async () => {
    const res = await request(app).post('/api/pedidos').send({});
    expect(res.statusCode).toBe(401);
  });
  test('TC-10 | GET /api/pedidos/:id sin token retorna 401', async () => {
    const res = await request(app).get('/api/pedidos/1');
    expect(res.statusCode).toBe(401);
  });
});

describe('TC-11 al TC-12 | Módulo de clientes /api/clientes', () => {
  test('TC-11 | GET /api/clientes sin token retorna 401', async () => {
    const res = await request(app).get('/api/clientes');
    expect(res.statusCode).toBe(401);
  });
  test('TC-12 | POST /api/clientes sin token retorna 401', async () => {
    const res = await request(app).post('/api/clientes').send({});
    expect(res.statusCode).toBe(401);
  });
});

describe('TC-13 | Módulo de productos /api/productos', () => {
  test('TC-13 | GET /api/productos sin token retorna 401', async () => {
    const res = await request(app).get('/api/productos');
    expect(res.statusCode).toBe(401);
  });
});

describe('TC-14 | Módulo de vendedores /api/vendedores', () => {
  test('TC-14 | GET /api/vendedores sin token retorna 401', async () => {
    const res = await request(app).get('/api/vendedores');
    expect(res.statusCode).toBe(401);
  });
});

describe('TC-15 al TC-16 | Módulos de visitas y cobros', () => {
  test('TC-15 | GET /api/visitas sin token retorna 401', async () => {
    const res = await request(app).get('/api/visitas');
    expect(res.statusCode).toBe(401);
  });
  test('TC-16 | GET /api/cobros sin token retorna 401', async () => {
    const res = await request(app).get('/api/cobros');
    expect(res.statusCode).toBe(401);
  });
});

describe('TC-17 al TC-18 | Cabeceras de seguridad HTTP', () => {
  test('TC-17 | La respuesta incluye cabecera X-Content-Type-Options', async () => {
    const res = await request(app).get('/');
    expect(res.headers).toHaveProperty('x-content-type-options');
  });
  test('TC-18 | La respuesta incluye cabecera X-Frame-Options', async () => {
    const res = await request(app).get('/');
    expect(res.headers).toHaveProperty('x-frame-options');
  });
});
