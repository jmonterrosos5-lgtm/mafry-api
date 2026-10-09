#!/usr/bin/env node
/**
 * Genera el SQL para cargar la cartera real de clientes de MAFRY.
 *
 *   node scripts/importar_clientes.js datos_privados/clientes.csv [--desactivar-demo] > datos_privados/clientes_reales.sql
 *
 * El CSV (UTF-8) lleva las columnas: nombre_negocio,departamento,codigo_vendedor
 * La carpeta datos_privados/ está en .gitignore: la lista real de clientes
 * no se sube al repositorio. El SQL resultante se ejecuta en Neon → SQL Editor.
 *
 * - Es idempotente: no duplica un cliente que ya exista con el mismo nombre.
 * - El vendedor se busca por código (VEN-001, VEN-002...), no por id.
 * - Todo va en una transacción: si algo falla no queda nada a medias.
 */
'use strict';
const fs = require('node:fs');

const [archivo, ...flags] = process.argv.slice(2);
if (!archivo) {
  console.error('Uso: node scripts/importar_clientes.js <archivo.csv> [--desactivar-demo]');
  process.exit(1);
}

// Clientes de demostración que crea scripts/seed.js
const DEMO = ['Tienda La Bendición', 'Depósito El Ahorro', 'Tienda Doña Tere', 'Super 24 Calzada San Juan',
  'Abarrotería San José', 'Depósito Los Pinos', 'Tienda El Paisano', 'Supermercado La Económica'];

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

function parseCsv(texto) {
  const filas = [];
  for (const linea of texto.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!linea.trim()) continue;
    const celdas = [];
    let actual = '';
    let comillas = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (comillas) {
        if (c === '"' && linea[i + 1] === '"') { actual += '"'; i++; }
        else if (c === '"') comillas = false;
        else actual += c;
      } else if (c === '"') comillas = true;
      else if (c === ',') { celdas.push(actual); actual = ''; }
      else actual += c;
    }
    celdas.push(actual);
    filas.push(celdas.map((s) => s.trim()));
  }
  return filas;
}

const [encabezado, ...filas] = parseCsv(fs.readFileSync(archivo, 'utf8'));
const col = (n) => {
  const i = encabezado.indexOf(n);
  if (i < 0) throw new Error(`Falta la columna "${n}" en el CSV`);
  return i;
};
const [iNom, iDep, iVen] = [col('nombre_negocio'), col('departamento'), col('codigo_vendedor')];

const clientes = filas.map((f, n) => {
  const nombre = f[iNom];
  const depto = f[iDep];
  const ven = f[iVen];
  if (!nombre || nombre.length > 120) throw new Error(`Fila ${n + 2}: nombre vacío o de más de 120 caracteres`);
  if (!/^VEN-\d{3}$/.test(ven)) throw new Error(`Fila ${n + 2}: código de vendedor inválido`);
  return { nombre, depto, ven };
});

const zonas = {};
for (const c of clientes) (zonas[c.ven] ??= new Set()).add(c.depto);

const out = [];
out.push('-- MAFRY · Carga de la cartera real de clientes');
out.push(`-- Generado ${new Date().toISOString().slice(0, 10)} · ${clientes.length} clientes · NO subir este archivo al repositorio`);
out.push('BEGIN;', '');
out.push('-- 1) Clientes (tipo super24), asignados por código de vendedor; no duplica si ya existe');
out.push('INSERT INTO clientes (nombre_negocio, tipo_cliente, direccion, id_vendedor)');
out.push('SELECT d.nombre, \'super24\', d.depto, v.id_vendedor');
out.push('FROM (VALUES');
out.push(clientes.map((c) => `  (${lit(c.nombre)}, ${lit(c.depto)}, ${lit(c.ven)})`).join(',\n'));
out.push(') AS d(nombre, depto, codigo)');
out.push('JOIN vendedores v ON v.codigo_vendedor = d.codigo');
out.push('WHERE NOT EXISTS (SELECT 1 FROM clientes c WHERE lower(c.nombre_negocio) = lower(d.nombre));', '');
out.push('-- 2) Zona asignada de cada vendedor según su cartera');
for (const [ven, set] of Object.entries(zonas)) {
  const zona = [...set].join(', ').slice(0, 80);
  out.push(`UPDATE vendedores SET zona_asignada = ${lit(zona)} WHERE codigo_vendedor = ${lit(ven)};`);
  out.push(`UPDATE rutas SET zona = ${lit(zona)} WHERE id_vendedor = (SELECT id_vendedor FROM vendedores WHERE codigo_vendedor = ${lit(ven)});`);
}
if (flags.includes('--desactivar-demo')) {
  out.push('', '-- 3) Ocultar los clientes de demostración (se conservan para no perder el historial de pedidos)');
  out.push(`UPDATE clientes SET activo = false WHERE nombre_negocio IN (${DEMO.map(lit).join(', ')});`);
}
out.push('', '-- 4) Bitácora de auditoría de la carga');
out.push(`INSERT INTO bitacora (accion, entidad, detalle) VALUES ('IMPORTAR_CLIENTES', 'clientes', '{"origen": "lista oficial MAFRY", "registros": ${clientes.length}}');`);
out.push('', 'COMMIT;', '');
out.push('-- Verificación');
out.push('SELECT v.codigo_vendedor, count(*) AS clientes FROM clientes c JOIN vendedores v USING (id_vendedor)');
out.push('WHERE c.activo GROUP BY 1 ORDER BY 1;');
process.stdout.write(out.join('\n') + '\n');
