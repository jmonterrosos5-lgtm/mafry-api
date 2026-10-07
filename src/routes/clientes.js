const express = require('express');
const { body } = require('express-validator');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { validar, idParam } = require('../middleware/validar');
const c = require('../controllers/clientesController');

const router = express.Router();
const TIPOS = ['tienda', 'deposito', 'supermercado', 'super24', 'otro'];

const reglas = (opcional) => {
  const o = (r) => (opcional ? r.optional() : r);
  return [
    o(body('nombre_negocio').isString().trim().isLength({ min: 2, max: 120 }).withMessage('Entre 2 y 120 caracteres')),
    body('nombre_contacto').optional({ values: 'null' }).isString().trim().isLength({ max: 120 }),
    body('telefono').optional({ values: 'null' }).matches(/^[0-9+\-\s]{8,20}$/).withMessage('Teléfono inválido'),
    body('direccion').optional({ values: 'null' }).isString().trim().isLength({ max: 200 }),
    body('latitud').optional({ values: 'null' }).isFloat({ min: -90, max: 90 }),
    body('longitud').optional({ values: 'null' }).isFloat({ min: -180, max: 180 }),
    body('tipo_cliente').optional({ values: 'null' }).isIn(TIPOS).withMessage(`Valores: ${TIPOS.join(', ')}`),
    body('id_vendedor').optional({ values: 'null' }).isInt({ min: 1 }),
    body('activo').optional().isBoolean(),
  ];
};

router.get('/', verificarToken, c.getClientes);
router.get('/:id', verificarToken, idParam, c.getClienteById);
router.post('/', verificarToken, validar(reglas(false)), c.crearCliente);
router.put('/:id', verificarToken, soloAdmin, idParam, validar(reglas(true)), c.actualizarCliente);

module.exports = router;
