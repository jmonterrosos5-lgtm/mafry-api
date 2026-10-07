const express = require('express');
const { body } = require('express-validator');
const { verificarToken } = require('../middleware/auth');
const { validar, idParam } = require('../middleware/validar');
const c = require('../controllers/visitasController');

const router = express.Router();
const ESTADOS = ['pendiente', 'en_curso', 'completada', 'no_atendida'];
const HORA = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

router.get('/', verificarToken, c.getVisitas);
router.get('/:id', verificarToken, idParam, c.getVisitaById);
router.post('/', verificarToken, validar([
  body('id_cliente').isInt({ min: 1 }).withMessage('Cliente requerido').toInt(),
  body('id_ruta').optional({ values: 'null' }).isInt({ min: 1 }),
  body('fecha_visita').optional({ values: 'null' }).isISO8601({ strict: true }).withMessage('Fecha inválida'),
  body('hora_inicio').optional({ values: 'null' }).matches(HORA),
  body('hora_fin').optional({ values: 'null' }).matches(HORA),
  body('latitud').optional({ values: 'null' }).isFloat({ min: -90, max: 90 }),
  body('longitud').optional({ values: 'null' }).isFloat({ min: -180, max: 180 }),
  body('observaciones').optional({ values: 'null' }).isString().trim().isLength({ max: 500 }),
  body('estado').optional({ values: 'null' }).isIn(ESTADOS),
]), c.crearVisita);
router.put('/:id', verificarToken, idParam, validar([
  body('hora_fin').optional({ values: 'null' }).matches(HORA),
  body('latitud').optional({ values: 'null' }).isFloat({ min: -90, max: 90 }),
  body('longitud').optional({ values: 'null' }).isFloat({ min: -180, max: 180 }),
  body('observaciones').optional({ values: 'null' }).isString().trim().isLength({ max: 500 }),
  body('estado').optional({ values: 'null' }).isIn(ESTADOS),
]), c.actualizarVisita);

module.exports = router;
