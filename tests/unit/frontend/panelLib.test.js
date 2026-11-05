/**
 * @jest-environment jsdom
 *
 * Pruebas unitarias — Frontend: panel administrativo web (public/admin/lib.js)
 *
 * Doble de prueba: fetch (mock). El cliente HTTP del panel recibe fetch por inyección de
 * dependencias; se reemplaza por un mock para probar el manejo de 401/400/200 sin levantar
 * la API ni depender de la red. obtenerToken y alExpirar también son dobles (stub y spy).
 */
const lib = require('../../../public/admin/lib');

const respuesta = (status, cuerpo) => ({
  status,
  ok: status >= 200 && status < 300,
  json: cuerpo === undefined ? jest.fn().mockRejectedValue(new Error('sin cuerpo')) : jest.fn().mockResolvedValue(cuerpo),
});

describe('utilidades DOM seguras', () => {
  test('h() inserta texto como nodo de texto, no como HTML (previene XSS)', () => {
    const el = lib.h('div', {}, '<img src=x onerror=alert(1)>');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  test('h() asigna clase, atributos y omite valores nulos/falsos', () => {
    const el = lib.h('button', { class: 'btn', disabled: true, title: null, hidden: false }, 'OK');
    expect(el.className).toBe('btn');
    expect(el.hasAttribute('disabled')).toBe(true);
    expect(el.hasAttribute('title')).toBe(false);
    expect(el.hasAttribute('hidden')).toBe(false);
  });

  test('h() registra manejadores de eventos con atributos on*', () => {
    const clic = jest.fn();
    lib.h('button', { onclick: clic }).click();
    expect(clic).toHaveBeenCalledTimes(1);
  });

  test('Q() formatea quetzales con 2 decimales y trata nulos como 0', () => {
    expect(lib.Q(1234.5)).toMatch(/^Q1,?234\.50$/);
    expect(lib.Q(null)).toBe('Q0.00');
  });

  test('fecha() muestra "—" si no hay fecha', () => {
    expect(lib.fecha(null)).toBe('—');
    expect(lib.fechaHora(undefined)).toBe('—');
  });

  test('fecha() con formato YYYY-MM-DD no se corre un día por la zona horaria', () => {
    expect(lib.fecha('2026-10-01')).toContain('1');
    expect(lib.fecha('2026-10-01')).toMatch(/10|oct/i);
  });

  test('tabla() sin filas muestra el mensaje de vacío', () => {
    expect(lib.tabla([{ t: 'A', v: (f) => f.a }], [], 'Nada').textContent).toBe('Nada');
  });

  test('tabla() genera una fila por registro y marca columnas numéricas', () => {
    const t = lib.tabla([{ t: 'Cliente', v: (f) => f.c }, { t: 'Total', num: 1, v: (f) => f.t }], [{ c: 'Tienda', t: 5 }, { c: 'Abarrotería', t: 7 }]);
    expect(t.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(t.querySelector('th.num').textContent).toBe('Total');
  });

  test('chip() reemplaza el guion bajo por espacio', () => {
    expect(lib.chip('en_ruta').textContent).toBe('en ruta');
  });
});

describe('cliente de la API (crearClienteApi)', () => {
  const crear = (fetchFn, token = 'TKN') => {
    const alExpirar = jest.fn();
    const api = lib.crearClienteApi({ base: '/api', fetchFn, obtenerToken: () => token, alExpirar });
    return { api, alExpirar };
  };

  test('envía el token Bearer y serializa el cuerpo en JSON', async () => {
    const fetchFn = jest.fn().mockResolvedValue(respuesta(200, { ok: 1 }));
    const { api } = crear(fetchFn);
    await expect(api('/pedidos', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ ok: 1 });
    const [url, opciones] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/pedidos');
    expect(opciones.headers.Authorization).toBe('Bearer TKN');
    expect(opciones.body).toBe('{"a":1}');
  });

  test('sin sesión no envía cabecera Authorization', async () => {
    const fetchFn = jest.fn().mockResolvedValue(respuesta(200, {}));
    await crear(fetchFn, null).api('/auth/login');
    expect(fetchFn.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
  });

  test('401 en una ruta protegida → cierra la sesión', async () => {
    const { api, alExpirar } = crear(jest.fn().mockResolvedValue(respuesta(401, { error: 'x' })));
    await expect(api('/pedidos')).rejects.toThrow('Sesión expirada');
    expect(alExpirar).toHaveBeenCalledWith('Su sesión expiró. Ingrese de nuevo.');
  });

  test('401 en el login → muestra el error, NO cierra la sesión', async () => {
    const { api, alExpirar } = crear(jest.fn().mockResolvedValue(respuesta(401, { error: 'Credenciales inválidas' })));
    await expect(api('/auth/login', { method: 'POST' })).rejects.toThrow('Credenciales inválidas');
    expect(alExpirar).not.toHaveBeenCalled();
  });

  test('400 con campos inválidos → mensaje con el detalle de cada campo', async () => {
    const cuerpo = { error: 'Datos inválidos', campos: [{ campo: 'monto', mensaje: 'Monto debe ser mayor que 0' }] };
    const { api } = crear(jest.fn().mockResolvedValue(respuesta(400, cuerpo)));
    await expect(api('/cobros')).rejects.toThrow('Datos inválidos: monto (Monto debe ser mayor que 0)');
  });

  test('error sin cuerpo JSON → "Error <código>"', async () => {
    const { api } = crear(jest.fn().mockResolvedValue(respuesta(502)));
    await expect(api('/pedidos')).rejects.toThrow('Error 502');
  });
});

describe('reglas de negocio en la interfaz', () => {
  test.each([
    ['pendiente', ['confirmado', 'anulado']],
    ['confirmado', ['entregado', 'anulado']],
    ['entregado', []],
    ['anulado', []],
    ['desconocido', []],
  ])('acciones disponibles para un pedido %s', (estado, esperado) => {
    expect(lib.accionesPedido(estado)).toEqual(esperado);
  });

  test('esRutaDeLogin identifica las rutas de inicio de sesión', () => {
    expect(lib.esRutaDeLogin('/auth/login')).toBe(true);
    expect(lib.esRutaDeLogin('/auth/mfa/verificar')).toBe(true);
    expect(lib.esRutaDeLogin('/pedidos')).toBe(false);
  });
});
