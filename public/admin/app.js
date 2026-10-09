'use strict';
// Panel administrativo MAFRY.
// Seguridad en el cliente:
//  - El token se guarda en sessionStorage (se borra al cerrar la pestaña).
//  - Todo el contenido se inserta con textContent (nunca innerHTML) para evitar XSS.
//  - Cierre de sesión automático tras 30 min de inactividad o si la API responde 401.

const API = '/api';
const INACTIVIDAD_MS = 30 * 60 * 1000;
const $ = (s) => document.querySelector(s);

// ---------- utilidades DOM seguras ----------
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

function aviso(texto, error = false) {
  const el = $('#aviso');
  el.textContent = texto;
  el.className = 'alerta' + (error ? ' error' : '');
  el.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => { el.hidden = true; }, 5000);
}

// ---------- sesión y llamadas a la API ----------
const sesion = {
  get token() { return sessionStorage.getItem('mafry_token'); },
  get usuario() { try { return JSON.parse(sessionStorage.getItem('mafry_usuario')); } catch { return null; } },
  guardar(token, usuario) { sessionStorage.setItem('mafry_token', token); sessionStorage.setItem('mafry_usuario', JSON.stringify(usuario)); },
  cerrar(msg) { sessionStorage.clear(); mostrarLogin(msg); },
};

async function api(ruta, opciones = {}) {
  const res = await fetch(API + ruta, {
    method: opciones.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(sesion.token ? { Authorization: `Bearer ${sesion.token}` } : {}) },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  let datos = null;
  try { datos = await res.json(); } catch { /* sin cuerpo */ }
  if (res.status === 401 && ruta !== '/auth/login') {
    sesion.cerrar('Su sesión expiró. Ingrese de nuevo.');
    throw new Error('Sesión expirada');
  }
  if (!res.ok) {
    const detalle = datos && datos.campos ? ': ' + datos.campos.map((c) => `${c.campo} (${c.mensaje})`).join(', ') : '';
    throw new Error(((datos && datos.error) || `Error ${res.status}`) + detalle);
  }
  return datos;
}

let temporizador;
function reiniciarInactividad() {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => sesion.cerrar('Sesión cerrada por inactividad.'), INACTIVIDAD_MS);
}
['click', 'keydown'].forEach((e) => document.addEventListener(e, () => sesion.token && reiniciarInactividad()));

// ---------- login ----------
function mostrarLogin(mensaje) {
  $('#vista-app').hidden = true;
  $('#vista-login').hidden = false;
  const err = $('#login-error');
  err.hidden = !mensaje;
  err.textContent = mensaje || '';
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const boton = e.target.querySelector('button');
  boton.disabled = true;
  try {
    const r = await api('/auth/login', { method: 'POST', body: { correo: f.get('correo'), contrasena: f.get('contrasena') } });
    if (r.usuario.rol !== 'admin') {
      mostrarLogin('Este panel es solo para administradores. Use la app móvil MAFRY Vendedor.');
      return;
    }
    sesion.guardar(r.token, r.usuario);
    e.target.reset();
    iniciarApp();
  } catch (err) {
    mostrarLogin(err.message);
  } finally {
    boton.disabled = false;
  }
});

$('#btn-salir').addEventListener('click', () => sesion.cerrar());

// ---------- navegación ----------
const VISTAS = {};
let vistaActual = 'dashboard';

function iniciarApp() {
  $('#vista-login').hidden = true;
  $('#vista-app').hidden = false;
  const u = sesion.usuario;
  $('#usuario-nombre').textContent = `${u.nombre} ${u.apellido}`;
  reiniciarInactividad();
  ir('dashboard');
}

async function ir(nombre) {
  vistaActual = nombre;
  document.querySelectorAll('#menu button').forEach((b) => b.classList.toggle('activo', b.dataset.vista === nombre));
  const titulos = { dashboard: 'Dashboard', pedidos: 'Pedidos', cobros: 'Cobros', clientes: 'Clientes', productos: 'Productos',
    vendedores: 'Vendedores', bitacora: 'Bitácora de auditoría', cuenta: 'Mi cuenta' };
  $('#titulo-vista').textContent = titulos[nombre];
  const cont = $('#vista');
  cont.replaceChildren(h('div', { class: 'vacio' }, 'Cargando…'));
  try {
    cont.replaceChildren(await VISTAS[nombre]());
  } catch (err) {
    cont.replaceChildren(h('div', { class: 'alerta error' }, err.message));
  }
}
$('#menu').addEventListener('click', (e) => { if (e.target.dataset.vista) ir(e.target.dataset.vista); });
$('#btn-recargar').addEventListener('click', () => ir(vistaActual));

// ---------- modal ----------
function abrirModal(...contenido) {
  $('#modal-cuerpo').replaceChildren(...contenido);
  $('#modal').showModal();
}
const cerrarModal = () => $('#modal').close();

function formulario(campos, valores, alGuardar, textoBoton = 'Guardar') {
  const form = h('form', { class: 'form-grid', novalidate: true });
  for (const c of campos) {
    let control;
    if (c.opciones) {
      control = h('select', { name: c.n }, c.opciones.map(([v, t]) => {
        const o = h('option', { value: v }, t);
        if (String(valores[c.n] ?? '') === String(v)) o.selected = true;
        return o;
      }));
    } else {
      control = h('input', { name: c.n, type: c.tipo || 'text', required: c.req, maxlength: c.max, step: c.step, min: c.min,
        autocomplete: c.tipo === 'password' ? 'new-password' : 'off' });
      if (valores[c.n] !== undefined && valores[c.n] !== null) control.value = valores[c.n];
    }
    form.append(h('label', {}, c.t, control));
  }
  const error = h('div', { class: 'alerta error', hidden: true });
  form.append(h('div', { class: 'fila-botones', style: 'grid-column:1/-1' },
    h('button', { type: 'button', class: 'btn fantasma', onclick: cerrarModal }, 'Cancelar'),
    h('button', { type: 'submit', class: 'btn primario' }, textoBoton)));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = {};
    for (const c of campos) {
      const v = form.elements[c.n].value.trim();
      if (v === '') continue;
      datos[c.n] = c.tipo === 'number' ? Number(v) : c.bool ? v === 'true' : v;
    }
    try {
      await alGuardar(datos);
      cerrarModal();
      ir(vistaActual);
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
  return h('div', {}, error, form);
}

// ---------- vistas ----------
VISTAS.dashboard = async () => {
  const d = await api('/admin/dashboard');
  const k = d.kpi;
  const max = Math.max(1, ...d.ventas_7_dias.map((x) => Number(x.ventas)));
  return h('div', {},
    h('div', { class: 'kpis' },
      [['Ventas de hoy', Q(k.ventas_hoy), 'acento'], ['Ventas del mes', Q(k.ventas_mes)], ['Cobrado en el mes', Q(k.cobrado_mes)],
        ['Saldo por cobrar', Q(k.saldo_por_cobrar), 'acento'], ['Pedidos pendientes', k.pedidos_pendientes], ['Visitas hoy', k.visitas_hoy],
        ['Clientes activos', k.clientes_activos]]
        .map(([e, v, c]) => h('div', { class: `kpi ${c || ''}` }, h('div', { class: 'etq' }, e), h('div', { class: 'val' }, v)))),
    h('div', { class: 'rejilla' },
      h('div', { class: 'panel' }, h('h3', {}, 'Ventas últimos 7 días'),
        h('div', { class: 'cuerpo' }, h('div', { class: 'barras' }, d.ventas_7_dias.map((x) =>
          h('div', { class: 'barra-col', title: Q(x.ventas) },
            h('span', { class: 'v' }, Number(x.ventas) ? Q(x.ventas).replace('.00', '') : ''),
            h('div', { class: 'b', style: `height:${(Number(x.ventas) / max) * 100}%` }),
            h('span', { class: 'd' }, new Date(x.dia + 'T12:00').toLocaleDateString('es-GT', { weekday: 'short', day: 'numeric' }))))))),
      h('div', { class: 'panel' }, h('h3', {}, 'Ventas del mes por vendedor'),
        tabla([{ t: 'Vendedor', v: (r) => `${r.vendedor} (${r.codigo_vendedor})` }, { t: 'Pedidos', num: 1, v: (r) => r.pedidos },
          { t: 'Ventas', num: 1, v: (r) => Q(r.ventas) }], d.por_vendedor))),
    h('div', { class: 'panel' }, h('h3', {}, 'Productos más vendidos'),
      tabla([{ t: 'Producto', v: (r) => r.nombre }, { t: 'Unidades', num: 1, v: (r) => r.unidades }, { t: 'Monto', num: 1, v: (r) => Q(r.monto) }],
        d.top_productos)));
};

VISTAS.pedidos = async () => {
  const pedidos = await api('/pedidos');
  const filtro = h('select', {}, [['', 'Todos'], ['pendiente', 'Pendientes'], ['confirmado', 'Confirmados'], ['entregado', 'Entregados'], ['anulado', 'Anulados']]
    .map(([v, t]) => h('option', { value: v }, t)));
  const zona = h('div');
  const SIG = { pendiente: [['confirmado', 'Confirmar']], confirmado: [['entregado', 'Marcar entregado']] };
  const pintar = () => zona.replaceChildren(tabla([
    { t: '#', v: (p) => p.id_pedido },
    { t: 'Fecha', v: (p) => fechaHora(p.fecha_pedido) },
    { t: 'Cliente', v: (p) => p.nombre_negocio },
    { t: 'Vendedor', v: (p) => p.vendedor },
    { t: 'Estado', v: (p) => chip(p.estado) },
    { t: 'Total', num: 1, v: (p) => Q(p.total) },
    { t: 'Saldo', num: 1, v: (p) => Q(p.saldo) },
    { t: '', v: (p) => h('div', { class: 'acciones' },
      h('button', { class: 'btn fantasma mini', onclick: () => verPedido(p.id_pedido) }, 'Ver'),
      (SIG[p.estado] || []).map(([e, t]) => h('button', { class: 'btn primario mini', onclick: () => cambiarEstado(p.id_pedido, e) }, t)),
      ['pendiente', 'confirmado'].includes(p.estado)
        ? h('button', { class: 'btn peligro mini', onclick: () => cambiarEstado(p.id_pedido, 'anulado') }, 'Anular') : null) },
  ], pedidos.filter((p) => !filtro.value || p.estado === filtro.value)));
  filtro.addEventListener('change', pintar);
  pintar();
  return h('div', {}, h('div', { class: 'filtros' }, h('label', {}, 'Estado', filtro)), h('div', { class: 'panel' }, zona));
};

async function cambiarEstado(id, estado) {
  if (estado === 'anulado' && !confirm(`¿Anular el pedido #${id}? El stock se devolverá al inventario.`)) return;
  try {
    await api(`/pedidos/${id}`, { method: 'PUT', body: { estado } });
    aviso(`Pedido #${id} actualizado a "${estado}"`);
    ir('pedidos');
  } catch (err) { aviso(err.message, true); }
}

async function verPedido(id) {
  const p = await api(`/pedidos/${id}`);
  abrirModal(h('h3', {}, `Pedido #${p.id_pedido} · ${p.nombre_negocio}`),
    h('p', {}, `Vendedor: ${p.vendedor} · ${fechaHora(p.fecha_pedido)} · `, chip(p.estado)),
    tabla([{ t: 'Producto', v: (d) => d.nombre_producto }, { t: 'Cant.', num: 1, v: (d) => d.cantidad },
      { t: 'Precio', num: 1, v: (d) => Q(d.precio_unitario) }, { t: 'Subtotal', num: 1, v: (d) => Q(d.subtotal) }], p.detalles),
    h('p', { style: 'text-align:right' }, h('strong', {}, `Total ${Q(p.total)}`), ` · Saldo ${Q(p.saldo)}`),
    p.observaciones ? h('p', {}, `Observaciones: ${p.observaciones}`) : null,
    h('div', { class: 'fila-botones' }, h('button', { class: 'btn primario', onclick: cerrarModal }, 'Cerrar')));
}

VISTAS.cobros = async () => {
  const cobros = await api('/cobros');
  const accion = async (id, estado) => {
    if (estado === 'anulado' && !confirm(`¿Anular el cobro #${id}?`)) return;
    try { await api(`/cobros/${id}`, { method: 'PUT', body: { estado } }); aviso(`Cobro #${id}: ${estado}`); ir('cobros'); }
    catch (err) { aviso(err.message, true); }
  };
  return h('div', { class: 'panel' }, tabla([
    { t: '#', v: (c) => c.id_cobro }, { t: 'Fecha', v: (c) => fecha(c.fecha_cobro) }, { t: 'Cliente', v: (c) => c.nombre_negocio },
    { t: 'Pedido', v: (c) => `#${c.id_pedido}` }, { t: 'Vendedor', v: (c) => c.vendedor }, { t: 'Método', v: (c) => c.metodo },
    { t: 'Referencia', v: (c) => c.referencia || '—' }, { t: 'Estado', v: (c) => chip(c.estado) }, { t: 'Monto', num: 1, v: (c) => Q(c.monto) },
    { t: '', v: (c) => h('div', { class: 'acciones' },
      c.estado === 'cobrado' ? h('button', { class: 'btn primario mini', onclick: () => accion(c.id_cobro, 'verificado') }, 'Verificar') : null,
      c.estado !== 'anulado' ? h('button', { class: 'btn peligro mini', onclick: () => accion(c.id_cobro, 'anulado') }, 'Anular') : null) },
  ], cobros));
};

VISTAS.clientes = async () => {
  const [clientes, vendedores] = await Promise.all([api('/clientes'), api('/vendedores')]);
  const opVend = [['', '— Sin asignar —'], ...vendedores.map((v) => [v.id_vendedor, `${v.nombre} ${v.apellido}`])];
  const TIPOS = [['tienda', 'Tienda'], ['deposito', 'Depósito'], ['supermercado', 'Supermercado'], ['super24', 'Super 24'], ['otro', 'Otro']];
  const campos = [
    { n: 'nombre_negocio', t: 'Nombre del negocio', req: true, max: 120 }, { n: 'nombre_contacto', t: 'Contacto', max: 120 },
    { n: 'telefono', t: 'Teléfono', max: 20 }, { n: 'direccion', t: 'Dirección', max: 200 },
    { n: 'tipo_cliente', t: 'Tipo', opciones: TIPOS }, { n: 'id_vendedor', t: 'Vendedor asignado', opciones: opVend },
    { n: 'latitud', t: 'Latitud', tipo: 'number', step: 'any' }, { n: 'longitud', t: 'Longitud', tipo: 'number', step: 'any' },
  ];
  const editar = (c) => abrirModal(h('h3', {}, c ? `Editar ${c.nombre_negocio}` : 'Nuevo cliente'),
    formulario(c ? [...campos, { n: 'activo', t: 'Estado', bool: true, opciones: [['true', 'Activo'], ['false', 'Inactivo']] }] : campos,
      c || {}, async (datos) => {
        if (datos.id_vendedor) datos.id_vendedor = Number(datos.id_vendedor);
        await api(c ? `/clientes/${c.id_cliente}` : '/clientes', { method: c ? 'PUT' : 'POST', body: datos });
        aviso(c ? 'Cliente actualizado' : 'Cliente creado');
      }));
  return h('div', {},
    h('div', { class: 'filtros' }, h('button', { class: 'btn acento', onclick: () => editar(null) }, '+ Nuevo cliente')),
    h('div', { class: 'panel' }, tabla([
      { t: 'Negocio', v: (c) => c.nombre_negocio }, { t: 'Tipo', v: (c) => c.tipo_cliente }, { t: 'Contacto', v: (c) => c.nombre_contacto || '—' },
      { t: 'Teléfono', v: (c) => c.telefono || '—' }, { t: 'Dirección', v: (c) => c.direccion || '—' }, { t: 'Vendedor', v: (c) => c.vendedor || '—' },
      { t: 'Estado', v: (c) => chip(c.activo ? 'activo' : 'inactivo') },
      { t: '', v: (c) => h('button', { class: 'btn fantasma mini', onclick: () => editar(c) }, 'Editar') },
    ], clientes)));
};

VISTAS.productos = async () => {
  const [productos, categorias] = await Promise.all([api('/productos'), api('/productos/categorias')]);
  const campos = [
    { n: 'codigo_producto', t: 'Código', max: 20 }, { n: 'nombre', t: 'Nombre', req: true, max: 120 },
    { n: 'id_categoria', t: 'Categoría', opciones: [['', '—'], ...categorias.map((c) => [c.id_categoria, c.nombre])] },
    { n: 'precio_unitario', t: 'Precio (Q)', tipo: 'number', step: '0.01', min: 0, req: true },
    { n: 'unidad_medida', t: 'Unidad', max: 20 }, { n: 'stock_disponible', t: 'Stock', tipo: 'number', min: 0 },
    { n: 'descripcion', t: 'Descripción', max: 300 },
  ];
  const editar = (p) => abrirModal(h('h3', {}, p ? `Editar ${p.nombre}` : 'Nuevo producto'),
    formulario(p ? [...campos.filter((c) => c.n !== 'codigo_producto'), { n: 'activo', t: 'Estado', bool: true, opciones: [['true', 'Activo'], ['false', 'Inactivo']] }] : campos,
      p || {}, async (datos) => {
        if (datos.id_categoria) datos.id_categoria = Number(datos.id_categoria);
        await api(p ? `/productos/${p.id_producto}` : '/productos', { method: p ? 'PUT' : 'POST', body: datos });
        aviso(p ? 'Producto actualizado (cambio registrado en bitácora)' : 'Producto creado');
      }));
  return h('div', {},
    h('div', { class: 'filtros' }, h('button', { class: 'btn acento', onclick: () => editar(null) }, '+ Nuevo producto')),
    h('div', { class: 'panel' }, tabla([
      { t: 'Código', v: (p) => p.codigo_producto || '—' }, { t: 'Producto', v: (p) => p.nombre }, { t: 'Categoría', v: (p) => p.categoria || '—' },
      { t: 'Unidad', v: (p) => p.unidad_medida }, { t: 'Precio', num: 1, v: (p) => Q(p.precio_unitario) },
      { t: 'Stock', num: 1, v: (p) => p.stock_disponible }, { t: 'Estado', v: (p) => chip(p.activo ? 'activo' : 'inactivo') },
      { t: '', v: (p) => h('button', { class: 'btn fantasma mini', onclick: () => editar(p) }, 'Editar') },
    ], productos)));
};

VISTAS.vendedores = async () => {
  const vendedores = await api('/vendedores');
  const nuevo = () => abrirModal(h('h3', {}, 'Nuevo vendedor'),
    h('p', { class: 'nota' }, 'La contraseña temporal debe tener al menos 10 caracteres, una letra y un número. Entréguela al vendedor por un canal privado.'),
    formulario([
      { n: 'nombre', t: 'Nombre', req: true, max: 80 }, { n: 'apellido', t: 'Apellido', req: true, max: 80 },
      { n: 'correo', t: 'Correo', tipo: 'email', req: true, max: 120 }, { n: 'contrasena', t: 'Contraseña temporal', tipo: 'password', req: true, max: 72 },
      { n: 'codigo_vendedor', t: 'Código (ej. VEN-003)', req: true, max: 20 }, { n: 'telefono', t: 'Teléfono', max: 20 },
      { n: 'zona_asignada', t: 'Zona asignada', max: 80 },
    ], {}, async (datos) => { await api('/vendedores', { method: 'POST', body: datos }); aviso('Vendedor creado'); }, 'Crear vendedor'));
  const accion = async (v, tipo) => {
    try {
      if (tipo === 'estado') {
        if (v.activo && !confirm(`¿Desactivar a ${v.nombre}? Perderá el acceso de inmediato.`)) return;
        await api(`/vendedores/${v.id_vendedor}`, { method: 'PUT', body: { activo: !v.activo } });
      } else if (tipo === 'desbloquear') {
        await api(`/vendedores/${v.id_vendedor}/desbloquear`, { method: 'POST' });
      }
      aviso('Vendedor actualizado'); ir('vendedores');
    } catch (err) { aviso(err.message, true); }
  };
  const restablecer = (v) => abrirModal(h('h3', {}, `Restablecer contraseña de ${v.nombre}`),
    formulario([{ n: 'contrasena', t: 'Nueva contraseña temporal', tipo: 'password', req: true, max: 72 }], {},
      async (datos) => { await api(`/vendedores/${v.id_vendedor}/restablecer-contrasena`, { method: 'POST', body: datos }); aviso('Contraseña restablecida'); }));
  return h('div', {},
    h('div', { class: 'filtros' }, h('button', { class: 'btn acento', onclick: nuevo }, '+ Nuevo vendedor')),
    h('div', { class: 'panel' }, tabla([
      { t: 'Código', v: (v) => v.codigo_vendedor }, { t: 'Nombre', v: (v) => `${v.nombre} ${v.apellido}` }, { t: 'Correo', v: (v) => v.correo },
      { t: 'Zona', v: (v) => v.zona_asignada || '—' }, { t: 'Último acceso', v: (v) => fechaHora(v.ultimo_acceso) },
      { t: 'Estado', v: (v) => h('span', {}, chip(v.activo ? 'activo' : 'inactivo'), v.bloqueado ? ' ' : null, v.bloqueado ? chip('bloqueado') : null) },
      { t: '', v: (v) => h('div', { class: 'acciones' },
        h('button', { class: v.activo ? 'btn peligro mini' : 'btn primario mini', onclick: () => accion(v, 'estado') }, v.activo ? 'Desactivar' : 'Activar'),
        v.bloqueado ? h('button', { class: 'btn fantasma mini', onclick: () => accion(v, 'desbloquear') }, 'Desbloquear') : null,
        h('button', { class: 'btn fantasma mini', onclick: () => restablecer(v) }, 'Restablecer clave')) },
    ], vendedores)));
};

VISTAS.bitacora = async () => {
  const filas = await api('/admin/bitacora?limite=200');
  return h('div', {},
    h('p', { class: 'nota' }, 'Registro inalterable de accesos y cambios. La base de datos impide editar o borrar estas filas.'),
    h('div', { class: 'panel' }, tabla([
      { t: 'Fecha', v: (b) => fechaHora(b.fecha) }, { t: 'Usuario', v: (b) => b.usuario || '—' },
      { t: 'Acción', v: (b) => h('span', { class: `chip ${/FALLIDO|BLOQUE|ANULAR|DESACTIVAR/.test(b.accion) ? 'anulado' : ''}` }, b.accion) },
      { t: 'Entidad', v: (b) => (b.entidad ? `${b.entidad}${b.id_entidad ? ' #' + b.id_entidad : ''}` : '—') },
      { t: 'IP', v: (b) => b.ip || '—' },
      { t: 'Detalle', v: (b) => h('div', { class: 'detalle-json', title: b.detalle ? JSON.stringify(b.detalle) : '' }, b.detalle ? JSON.stringify(b.detalle) : '') },
    ], filas)));
};

VISTAS.cuenta = async () => {
  const u = await api('/auth/perfil');
  const err = h('div', { class: 'alerta error', hidden: true });
  const form = h('form', { class: 'form-grid' },
    h('label', {}, 'Contraseña actual', h('input', { type: 'password', name: 'actual', required: true, autocomplete: 'current-password' })),
    h('label', {}, 'Nueva contraseña', h('input', { type: 'password', name: 'nueva', required: true, minlength: 10, maxlength: 72, autocomplete: 'new-password' })),
    h('div', { style: 'grid-column:1/-1' }, h('button', { class: 'btn primario', type: 'submit' }, 'Cambiar contraseña')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/auth/cambiar-contrasena', { method: 'POST', body: { actual: form.elements.actual.value, nueva: form.elements.nueva.value } });
      form.reset(); err.hidden = true; aviso('Contraseña actualizada');
    } catch (x) { err.textContent = x.message; err.hidden = false; }
  });
  return h('div', {},
    h('div', { class: 'panel' }, h('h3', {}, 'Datos de la cuenta'), h('div', { class: 'cuerpo' },
      h('p', {}, `${u.nombre} ${u.apellido} · ${u.correo} · rol ${u.rol}`), h('p', { class: 'nota' }, `Último acceso: ${fechaHora(u.ultimo_acceso)}`))),
    h('div', { class: 'panel' }, h('h3', {}, 'Cambiar contraseña'), h('div', { class: 'cuerpo' },
      h('p', { class: 'nota' }, 'Mínimo 10 caracteres, con al menos una letra y un número.'), err, form)));
};

// ---------- arranque ----------
if (sesion.token && sesion.usuario) iniciarApp();
else mostrarLogin();
