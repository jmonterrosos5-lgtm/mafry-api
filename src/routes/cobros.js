const express = require('express');
const { body } = require('express-validator');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { validar, idParam } = require('../middleware/validar');
const c = require('../controllers/cobrosController');

const router = express.Router();

router.get('/', verificarToken, c.getCobros);
router.get('/:id', verificarToken, idParam, c.getCobroById);
router.post('/', verificarToken, validar([
  body('id_pedido').isInt({ min: 1 }).toInt(),
  body('monto').isFloat({ gt: 0, max: 1000000 }).withMessage('Monto debe ser mayor que 0').toFloat(),
  body('metodo').isIn(['efectivo', 'transferencia', 'cheque']).withMessage('Método inválido'),
  body('referencia').optional({ values: 'null' }).isString().trim().isLength({ max: 60 }).matches(/^[\w\-/ ]*$/),
]), c.crearCobro);
router.put('/:id', verificarToken, soloAdmin, idParam, validar([
  body('estado').optional().isIn(['cobrado', 'verificado', 'anulado']),
  body('referencia').optional({ values: 'null' }).isString().trim().isLength({ max: 60 }),
]), c.actualizarCobro);

module.exports = router;
