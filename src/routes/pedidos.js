const express = require('express');
const { body } = require('express-validator');
const { verificarToken } = require('../middleware/auth');
const { validar, idParam } = require('../middleware/validar');
const c = require('../controllers/pedidosController');

const router = express.Router();

router.get('/', verificarToken, c.getPedidos);
router.get('/:id', verificarToken, idParam, c.getPedidoById);
router.post('/', verificarToken, validar([
  body('id_visita').isInt({ min: 1 }).withMessage('Visita requerida').toInt(),
  body('items').isArray({ min: 1, max: 50 }).withMessage('Debe incluir entre 1 y 50 productos'),
  body('items.*.id_producto').isInt({ min: 1 }).toInt(),
  body('items.*.cantidad').isInt({ min: 1, max: 10000 }).withMessage('Cantidad entre 1 y 10000').toInt(),
  // precio_unitario enviado por el cliente se IGNORA: se toma del catálogo.
  body('metodo_pago').optional({ values: 'null' }).isIn(['efectivo', 'credito', 'transferencia']),
  body('observaciones').optional({ values: 'null' }).isString().trim().isLength({ max: 500 }),
]), c.crearPedido);
router.put('/:id', verificarToken, idParam, validar([
  body('estado').optional().isIn(['pendiente', 'confirmado', 'entregado', 'anulado']),
  body('observaciones').optional({ values: 'null' }).isString().trim().isLength({ max: 500 }),
]), c.actualizarEstadoPedido);

module.exports = router;
