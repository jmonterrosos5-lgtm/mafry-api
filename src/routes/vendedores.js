const express = require('express');
const { body } = require('express-validator');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { validar, idParam } = require('../middleware/validar');
const { reglaContrasena } = require('../utils/politicas');
const c = require('../controllers/vendedoresController');

const router = express.Router();
// Todo el módulo de vendedores es exclusivo del administrador.
router.use(verificarToken, soloAdmin);

router.get('/', c.getVendedores);
router.get('/:id', idParam, c.getVendedorById);
router.post('/', validar([
  body('nombre').isString().trim().isLength({ min: 2, max: 80 }),
  body('apellido').isString().trim().isLength({ min: 2, max: 80 }),
  body('correo').isEmail().isLength({ max: 120 }),
  reglaContrasena('contrasena'),
  body('codigo_vendedor').matches(/^[A-Z0-9-]{3,20}$/).withMessage('Solo mayúsculas, números y guion (3-20)'),
  body('telefono').optional({ values: 'null' }).matches(/^[0-9+\-\s]{8,20}$/),
  body('zona_asignada').optional({ values: 'null' }).isString().trim().isLength({ max: 80 }),
]), c.crearVendedor);
router.put('/:id', idParam, validar([
  body('telefono').optional({ values: 'null' }).matches(/^[0-9+\-\s]{8,20}$/),
  body('zona_asignada').optional({ values: 'null' }).isString().trim().isLength({ max: 80 }),
  body('activo').optional().isBoolean(),
]), c.actualizarVendedor);
router.post('/:id/desbloquear', idParam, c.desbloquearVendedor);
router.post('/:id/restablecer-contrasena', idParam, validar([reglaContrasena('contrasena')]), c.restablecerContrasena);

module.exports = router;
