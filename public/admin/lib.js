'use strict';
// Utilidades del panel administrativo MAFRY separadas de app.js para poder probarlas
// de forma aislada (pruebas unitarias con Jest + jsdom en tests/unit/frontend).
// En el navegador se exponen como window.MafryLib; en Node se exportan con module.exports.
(function (raiz, fabrica) {
  const lib = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else raiz.MafryLib = lib;
})(typeof self !== 'undefined' ? self : this, function () {
  // ---------- utilidades DOM seguras (nunca innerHTML, para evitar XSS) ----------
  function h(tag, attrs = {}, ...hijos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v; // CSSOM: permitido por la CSP (no usa estilos inline)
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const hijo of hijos.flat()) {
      if (hijo === null || hijo === undefined || hijo === false) continue;
      el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
    }
    return el;
  }

  const Q = (n) => 'Q' + Number(n || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fecha = (f) => (f ? new Date(String(f).length === 10 ? f + 'T12:00' : f).toLocaleDateString('es-GT') : '—');
  const fechaHora = (f) => (f ? new Date(f).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const chip = (t) => h('span', { class: `chip ${t}` }, String(t).replace('_', ' '));

  function tabla(columnas, filas, vacio = 'Sin registros') {
    if (!filas.length) return h('div', { class: 'vacio' }, vacio);
    return h('div', { class: 'tabla-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, columnas.map((c) => h('th', { class: c.num ? 'num' : null }, c.t)))),
      h('tbody', {}, filas.map((f) => h('tr', {}, columnas.map((c) => h('td', { class: c.num ? 'num' : null }, c.v(f))))))));
  }

  // Mensaje de error legible a partir de la respuesta de la API.
  function mensajeError(datos, estado) {
    const detalle = datos && datos.campos ? ': ' + datos.campos.map((c) => `${c.campo} (${c.mensaje})`).join(', ') : '';
    return ((datos && datos.error) || `Error ${estado}`) + detalle;
  }

  // Rutas en las que un 401 significa "credenciales incorrectas", no "sesión expirada".
  const esRutaDeLogin = (ruta) => ruta.startsWith('/auth/login') || ruta.startsWith('/auth/mfa/verificar');

  // Cliente HTTP de la API. Las dependencias (fetch, token, acción al expirar) se inyectan:
  // en el navegador son las reales y en las pruebas se reemplazan por dobles de prueba.
  function crearClienteApi({ base = '/api', fetchFn, obtenerToken, alExpirar }) {
    return async function api(ruta, opciones = {}) {
      const token = obtenerToken();
      const res = await fetchFn(base + ruta, {
        method: opciones.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: opciones.body ? JSON.stringify(opciones.body) : undefined,
      });
      let datos = null;
      try { datos = await res.json(); } catch { /* sin cuerpo */ }
      if (res.status === 401 && !esRutaDeLogin(ruta)) {
        alExpirar('Su sesión expiró. Ingrese de nuevo.');
        throw new Error('Sesión expirada');
      }
      if (!res.ok) throw new Error(mensajeError(datos, res.status));
      return datos;
    };
  }

  // Transiciones de estado de un pedido que el panel ofrece como botones
  // (refleja la regla de negocio de la API: pendiente → confirmado → entregado; anular antes de entregar).
  const TRANSICIONES_PEDIDO = {
    pendiente: ['confirmado', 'anulado'],
    confirmado: ['entregado', 'anulado'],
    entregado: [],
    anulado: [],
  };
  const accionesPedido = (estado) => TRANSICIONES_PEDIDO[estado] || [];

  return { h, Q, fecha, fechaHora, chip, tabla, mensajeError, esRutaDeLogin, crearClienteApi, accionesPedido };
});
