const pool = require('../config/db');

// Indicadores para el panel administrativo (pedidos anulados excluidos).
const resumen = async (req, res) => {
  const [kpi, porVendedor, topProductos, ventasDias] = await Promise.all([
    pool.query(`
      SELECT
        COALESCE(SUM(total) FILTER (WHERE fecha_pedido::date = CURRENT_DATE AND estado <> 'anulado'),0) AS ventas_hoy,
        COALESCE(SUM(total) FILTER (WHERE date_trunc('month', fecha_pedido) = date_trunc('month', now()) AND estado <> 'anulado'),0) AS ventas_mes,
        COUNT(*) FILTER (WHERE estado = 'pendiente') AS pedidos_pendientes,
        (SELECT COALESCE(SUM(monto),0) FROM cobros WHERE estado <> 'anulado'
            AND date_trunc('month', fecha_cobro) = date_trunc('month', now())) AS cobrado_mes,
        (SELECT COALESCE(SUM(p.total),0) - COALESCE((SELECT SUM(monto) FROM cobros WHERE estado <> 'anulado'),0)
           FROM pedidos p WHERE p.estado <> 'anulado') AS saldo_por_cobrar,
        (SELECT COUNT(*) FROM visitas WHERE fecha_visita = CURRENT_DATE) AS visitas_hoy,
        (SELECT COUNT(*) FROM clientes WHERE activo) AS clientes_activos
      FROM pedidos`),
    pool.query(`
      SELECT u.nombre || ' ' || u.apellido AS vendedor, v.codigo_vendedor,
             COUNT(p.id_pedido) AS pedidos, COALESCE(SUM(p.total),0) AS ventas
        FROM vendedores v JOIN usuarios u ON u.id_usuario = v.id_usuario
        LEFT JOIN visitas vi ON vi.id_vendedor = v.id_vendedor
        LEFT JOIN pedidos p ON p.id_visita = vi.id_visita AND p.estado <> 'anulado'
            AND date_trunc('month', p.fecha_pedido) = date_trunc('month', now())
       GROUP BY u.nombre, u.apellido, v.codigo_vendedor ORDER BY ventas DESC`),
    pool.query(`
      SELECT pr.nombre, SUM(dp.cantidad) AS unidades, SUM(dp.subtotal) AS monto
        FROM detalle_pedido dp JOIN pedidos p ON p.id_pedido = dp.id_pedido AND p.estado <> 'anulado'
        JOIN productos pr ON pr.id_producto = dp.id_producto
       GROUP BY pr.nombre ORDER BY monto DESC LIMIT 5`),
    pool.query(`
      SELECT to_char(d, 'YYYY-MM-DD') AS dia, COALESCE(SUM(p.total),0) AS ventas
        FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day') d
        LEFT JOIN pedidos p ON p.fecha_pedido::date = d::date AND p.estado <> 'anulado'
       GROUP BY d ORDER BY d`),
  ]);
  res.json({ kpi: kpi.rows[0], por_vendedor: porVendedor.rows, top_productos: topProductos.rows, ventas_7_dias: ventasDias.rows });
};

const bitacora = async (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 100, 500);
  const result = await pool.query(
    `SELECT b.id_bitacora, b.fecha, b.accion, b.entidad, b.id_entidad, b.ip, b.detalle,
            u.correo AS usuario
       FROM bitacora b LEFT JOIN usuarios u ON u.id_usuario = b.id_usuario
      ORDER BY b.fecha DESC, b.id_bitacora DESC LIMIT $1`, [limite]);
  res.json(result.rows);
};

module.exports = { resumen, bitacora };
