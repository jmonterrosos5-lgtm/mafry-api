// Carga datos iniciales de demostración. Uso: npm run seed
// Las contraseñas NO están en el código: se leen de SEED_ADMIN_PASSWORD y
// SEED_VENDEDOR_PASSWORD; si no existen, se generan al azar y se muestran UNA sola vez.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const generar = () => crypto.randomBytes(9).toString('base64url') + '7a';

const CATEGORIAS = ['Paletas', 'Gomitas', 'Manías', 'Chocolates'];
const PRODUCTOS = [
  ['PAL-001', 'Paletas', 'Paleta de fresa (bolsa 50 u)', 38.0, 'bolsa', 120],
  ['PAL-002', 'Paletas', 'Paleta de tamarindo con chile (bolsa 50 u)', 42.0, 'bolsa', 90],
  ['PAL-003', 'Paletas', 'Paleta de leche (bolsa 50 u)', 40.0, 'bolsa', 80],
  ['GOM-001', 'Gomitas', 'Gomitas de ositos 1 lb', 22.5, 'bolsa', 150],
  ['GOM-002', 'Gomitas', 'Gomitas enchiladas 1 lb', 25.0, 'bolsa', 110],
  ['GOM-003', 'Gomitas', 'Gusanitos ácidos 1 lb', 24.0, 'bolsa', 100],
  ['MAN-001', 'Manías', 'Manía salada (display 24 u)', 36.0, 'display', 70],
  ['MAN-002', 'Manías', 'Manía japonesa (display 24 u)', 39.0, 'display', 65],
  ['CHO-001', 'Chocolates', 'Chocolate de leche (caja 24 u)', 55.0, 'caja', 60],
  ['CHO-002', 'Chocolates', 'Bombón relleno (caja 24 u)', 60.0, 'caja', 45],
];
const CLIENTES = [
  ['Tienda La Bendición', 'Marta López', 'tienda', 'Zona 18, Ciudad de Guatemala', 14.6560, -90.4620, 1],
  ['Depósito El Ahorro', 'Carlos Pérez', 'deposito', 'Zona 6, Ciudad de Guatemala', 14.6545, -90.4980, 1],
  ['Tienda Doña Tere', 'Teresa Ramírez', 'tienda', 'Zona 17, Ciudad de Guatemala', 14.6400, -90.4520, 1],
  ['Super 24 Calzada San Juan', 'Encargado de turno', 'super24', 'Zona 7, Ciudad de Guatemala', 14.6430, -90.5550, 1],
  ['Abarrotería San José', 'José Hernández', 'tienda', 'Mixco', 14.6300, -90.6000, 2],
  ['Depósito Los Pinos', 'Ana Castillo', 'deposito', 'Villa Nueva', 14.5250, -90.5870, 2],
  ['Tienda El Paisano', 'Luis Morales', 'tienda', 'Villa Nueva', 14.5300, -90.5950, 2],
  ['Supermercado La Económica', 'Gerencia', 'supermercado', 'Zona 12, Ciudad de Guatemala', 14.5900, -90.5400, 2],
];

async function sembrar({ soloSiVacio = false } = {}) {
  const existentes = await pool.query('SELECT COUNT(*)::int AS n FROM usuarios');
  if (soloSiVacio && existentes.rows[0].n > 0) return;
  if (existentes.rows[0].n > 0) {
    console.log('ℹ️  Ya hay usuarios; no se vuelve a sembrar.');
    return;
  }

  const passAdmin = process.env.SEED_ADMIN_PASSWORD || generar();
  const passVend = process.env.SEED_VENDEDOR_PASSWORD || generar();
  const hAdmin = await bcrypt.hash(passAdmin, 12);
  const hVend = await bcrypt.hash(passVend, 12);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO usuarios (nombre, apellido, correo, contrasena_hash, rol)
       VALUES ('Manfredo', 'Martínez', 'admin@mafry.test', $1, 'admin')`, [hAdmin]);

    const vendedores = [];
    for (const [nombre, apellido, correo, codigo, zona, tel] of [
      ['Kevin', 'García', 'kevin.garcia@mafry.test', 'VEN-001', 'Zonas 6, 7, 17 y 18', '5555-1001'],
      ['Diego', 'Ruiz', 'diego.ruiz@mafry.test', 'VEN-002', 'Mixco, Villa Nueva y Zona 12', '5555-1002'],
    ]) {
      const u = await client.query(
        `INSERT INTO usuarios (nombre, apellido, correo, contrasena_hash, rol)
         VALUES ($1,$2,$3,$4,'vendedor') RETURNING id_usuario`, [nombre, apellido, correo, hVend]);
      const v = await client.query(
        `INSERT INTO vendedores (id_usuario, codigo_vendedor, telefono, zona_asignada)
         VALUES ($1,$2,$3,$4) RETURNING id_vendedor`, [u.rows[0].id_usuario, codigo, tel, zona]);
      vendedores.push(v.rows[0].id_vendedor);
      await client.query('INSERT INTO rutas (nombre, zona, id_vendedor) VALUES ($1,$2,$3)', [`Ruta ${codigo}`, zona, v.rows[0].id_vendedor]);
    }

    const cat = {};
    for (const n of CATEGORIAS) {
      cat[n] = (await client.query('INSERT INTO categorias (nombre) VALUES ($1) RETURNING id_categoria', [n])).rows[0].id_categoria;
    }
    const productos = [];
    for (const [cod, c, nombre, precio, um, stock] of PRODUCTOS) {
      productos.push((await client.query(
        `INSERT INTO productos (codigo_producto, id_categoria, nombre, precio_unitario, unidad_medida, stock_disponible)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_producto, precio_unitario`, [cod, cat[c], nombre, precio, um, stock])).rows[0]);
    }
    const clientes = [];
    for (const [neg, cont, tipo, dir, lat, lon, ven] of CLIENTES) {
      clientes.push({
        id: (await client.query(
          `INSERT INTO clientes (nombre_negocio, nombre_contacto, tipo_cliente, direccion, latitud, longitud, id_vendedor)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id_cliente`, [neg, cont, tipo, dir, lat, lon, vendedores[ven - 1]])).rows[0].id_cliente,
        ven: vendedores[ven - 1],
      });
    }

    // Historial de los últimos 6 días para que el panel muestre indicadores.
    let k = 0;
    for (let d = 6; d >= 1; d--) {
      for (const cli of clientes.filter((_, i) => (i + d) % 2 === 0)) {
        const vi = await client.query(
          `INSERT INTO visitas (id_vendedor, id_cliente, fecha_visita, hora_inicio, hora_fin, estado)
           VALUES ($1,$2,CURRENT_DATE - $3::int,'09:00','09:20','completada') RETURNING id_visita`, [cli.ven, cli.id, d]);
        const pe = await client.query(
          `INSERT INTO pedidos (id_visita, fecha_pedido, estado, metodo_pago)
           VALUES ($1, now() - ($2 || ' days')::interval, 'entregado', 'efectivo') RETURNING id_pedido`, [vi.rows[0].id_visita, String(d)]);
        for (let j = 0; j < 3; j++) {
          const p = productos[(k + j * 3) % productos.length];
          await client.query('INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario) VALUES ($1,$2,$3,$4)',
            [pe.rows[0].id_pedido, p.id_producto, 1 + ((k + j) % 4), p.precio_unitario]);
        }
        k++;
        const tot = await client.query(
          `UPDATE pedidos SET total = (SELECT SUM(subtotal) FROM detalle_pedido WHERE id_pedido = $1)
            WHERE id_pedido = $1 RETURNING total`, [pe.rows[0].id_pedido]);
        if (k % 3 !== 0) {
          await client.query(
            `INSERT INTO cobros (id_pedido, id_vendedor, monto, fecha_cobro, metodo, estado)
             VALUES ($1,$2,$3,CURRENT_DATE - $4::int,'efectivo','verificado')`, [pe.rows[0].id_pedido, cli.ven, tot.rows[0].total, d]);
        }
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log('✅ Datos de demostración cargados');
  if (!process.env.SEED_ADMIN_PASSWORD || !process.env.SEED_VENDEDOR_PASSWORD) {
    console.log('⚠️  Contraseñas generadas (se muestran solo esta vez, guárdalas en un lugar seguro):');
    if (!process.env.SEED_ADMIN_PASSWORD) console.log('   admin@mafry.test        →', passAdmin);
    if (!process.env.SEED_VENDEDOR_PASSWORD) console.log('   vendedores (VEN-001/002) →', passVend);
  }
}

if (require.main === module) {
  sembrar()
    .catch((err) => { console.error('❌ Error al sembrar:', err.message); process.exitCode = 1; })
    .finally(() => pool.end());
}

module.exports = { sembrar };
