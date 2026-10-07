const pool = require('../config/db');
const { esAdmin } = require('../middleware/auth');
const { registrar } = require('../utils/bitacora');
const { ErrorApp } = require('../middleware/errores');

const BASE = `SELECT co.*, p.total AS total_pedido, c.nombre_negocio, u.nombre || ' ' || u.apellido AS vendedor
                FROM cobros co
                JOIN pedidos p ON p.id_pedido = co.id_pedido
                JOIN visitas vi ON vi.id_visita = p.id_visita
                LEFT JOIN clientes c ON c.id_cliente = vi.id_cliente
                LEFT JOIN vendedores v ON v.id_vendedor = co.id_vendedor
                LEFT JOIN usuarios u ON u.id_usuario = v.id_usuario`;

const getCobros = async (req, res) => {
  const result = esAdmin(req)
    ? await pool.query(`${BASE} ORDER BY co.fecha_cobro DESC, co.id_cobro DESC LIMIT 500`)
    : await pool.query(`${BASE} WHERE co.id_vendedor = $1 ORDER BY co.fecha_cobro DESC, co.id_cobro DESC LIMIT 200`,
        [req.usuario.id_vendedor]);
  res.json(result.rows);
};

const getCobroById = async (req, res) => {
  const { id } = req.params;
  const result = esAdmin(req)
    ? await pool.query(`${BASE} WHERE co.id_cobro = $1`, [id])
    : await pool.query(`${BASE} WHERE co.id_cobro = $1 AND co.id_vendedor = $2`, [id, req.usuario.id_vendedor]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Cobro no encontrado' });
  res.json(result.rows[0]);
};

const crearCobro = async (req, res) => {
  if (esAdmin(req)) return res.status(403).json({ error: 'Los cobros los registra el vendedor' });
  const { id_pedido, monto, metodo, referencia } = req.body;
  const client = await pool.connect();
  let cobro;
  try {
    await client.query('BEGIN');
    const ped = await client.query(
      `SELECT p.total, p.estado,
              p.total - COALESCE((SELECT SUM(monto) FROM cobros WHERE id_pedido = p.id_pedido AND estado <> 'anulado'),0) AS saldo
         FROM pedidos p JOIN visitas v ON v.id_visita = p.id_visita
        WHERE p.id_pedido = $1 AND v.id_vendedor = $2
        FOR UPDATE OF p`, [id_pedido, req.usuario.id_vendedor]);
    if (ped.rows.length === 0) throw new ErrorApp(404, 'Pedido no encontrado');
    if (ped.rows[0].estado === 'anulado') throw new ErrorApp(409, 'No se puede cobrar un pedido anulado');
    if (Number(monto) > Number(ped.rows[0].saldo)) {
      throw new ErrorApp(409, `El monto excede el saldo pendiente (Q${Number(ped.rows[0].saldo).toFixed(2)})`);
    }
    if (metodo !== 'efectivo' && !referencia) throw new ErrorApp(400, 'La referencia es obligatoria para transferencia o cheque');

    cobro = (await client.query(
      `INSERT INTO cobros (id_pedido, id_vendedor, monto, metodo, referencia, estado)
       VALUES ($1,$2,$3,$4,$5,'cobrado') RETURNING *`,
      [id_pedido, req.usuario.id_vendedor, monto, metodo, referencia ?? null])).rows[0];
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await registrar(req, 'CREAR', 'cobros', cobro.id_cobro, { id_pedido, monto, metodo });
  res.status(201).json(cobro);
};

// Solo el admin verifica o anula cobros (segregación de funciones: quien cobra no se autoverifica).
const actualizarCobro = async (req, res) => {
  const { id } = req.params;
  const { estado, referencia } = req.body;
  const result = await pool.query(
    `UPDATE cobros SET estado = COALESCE($1, estado), referencia = COALESCE($2, referencia)
      WHERE id_cobro = $3 AND estado <> 'anulado' RETURNING *`, [estado ?? null, referencia ?? null, id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Cobro no encontrado o ya anulado' });
  await registrar(req, estado === 'anulado' ? 'ANULAR' : 'ACTUALIZAR', 'cobros', Number(id), { estado });
  res.json(result.rows[0]);
};

module.exports = { getCobros, getCobroById, crearCobro, actualizarCobro };
