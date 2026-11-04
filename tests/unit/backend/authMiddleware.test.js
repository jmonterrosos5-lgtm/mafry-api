/**
 * Pruebas unitarias — Middleware de autenticación y autorización (src/middleware/auth.js)
 * Parte del módulo crítico Autenticación. Requerimiento: RF-11 (acceso solo con JWT válido).
 *
 * Doble de prueba: db (mock) — el middleware consulta si el usuario sigue activo y su
 * version_token; el mock permite simular usuario desactivado o sesión revocada.
 */
jest.mock('../../../src/config/env', () => require('../helpers/envStub'));
jest.mock('../../../src/config/db', () => ({ query: jest.fn() }));

const jwt = require('jsonwebtoken');
const pool = require('../../../src/config/db');
const env = require('../helpers/envStub');
const { verificarToken, permitirRoles, esAdmin } = require('../../../src/middleware/auth');
const { filas, resFalso } = require('../helpers/dobles');

const firmar = (payload, opciones = {}) =>
  jwt.sign({ sub: 2, rol: 'vendedor', typ: 'acceso', ver: 1, ...payload }, env.JWT_SECRET, { issuer: 'mafry-api', expiresIn: '8h', ...opciones });
const reqCon = (token) => ({ headers: { authorization: `Bearer ${token}` } });

beforeEach(() => jest.clearAllMocks());

describe('verificarToken', () => {
  test('sin cabecera Authorization → 401 "Token requerido"', async () => {
    const res = resFalso(); const next = jest.fn();
    await verificarToken({ headers: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('token expirado → 401', async () => {
    const res = resFalso(); const next = jest.fn();
    await verificarToken(reqCon(firmar({}, { expiresIn: -10 })), res, next);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido o expirado' });
  });

  test('token firmado con otra clave → 401', async () => {
    const falso = jwt.sign({ sub: 1, typ: 'acceso' }, 'otra-clave-cualquiera-de-32-caracteres!!', { issuer: 'mafry-api' });
    const res = resFalso();
    await verificarToken(reqCon(falso), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('token intermedio de MFA no abre la API → 401', async () => {
    const res = resFalso();
    await verificarToken(reqCon(firmar({ typ: 'mfa' })), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('sesión revocada (version_token distinto) → 401', async () => {
    pool.query.mockResolvedValueOnce(filas({ id_usuario: 2, rol: 'vendedor', activo: true, version_token: 2, id_vendedor: 1 }));
    const res = resFalso();
    await verificarToken(reqCon(firmar({ ver: 1 })), res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ error: 'Sesión cerrada. Ingrese de nuevo.' });
  });

  test('vendedor sin registro de vendedor activo → 403', async () => {
    pool.query.mockResolvedValueOnce(filas({ id_usuario: 2, rol: 'vendedor', activo: true, version_token: 1, id_vendedor: null }));
    const res = resFalso();
    await verificarToken(reqCon(firmar({})), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('token válido y usuario activo → llama a next() y adjunta req.usuario', async () => {
    pool.query.mockResolvedValueOnce(filas({ id_usuario: 2, rol: 'vendedor', activo: true, version_token: 1, id_vendedor: 1 }));
    const req = reqCon(firmar({})); const next = jest.fn();
    await verificarToken(req, resFalso(), next);
    expect(next).toHaveBeenCalled();
    expect(req.usuario).toEqual({ id_usuario: 2, rol: 'vendedor', id_vendedor: 1 });
  });
});

describe('permitirRoles / esAdmin', () => {
  test('rol no permitido → 403', () => {
    const res = resFalso(); const next = jest.fn();
    permitirRoles('admin')({ usuario: { rol: 'vendedor' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('rol permitido → next()', () => {
    const next = jest.fn();
    permitirRoles('admin', 'supervisor')({ usuario: { rol: 'supervisor' } }, resFalso(), next);
    expect(next).toHaveBeenCalled();
  });

  test('esAdmin solo es verdadero para el rol admin', () => {
    expect(esAdmin({ usuario: { rol: 'admin' } })).toBe(true);
    expect(esAdmin({ usuario: { rol: 'vendedor' } })).toBe(false);
    expect(esAdmin({})).toBeFalsy();
  });
});
