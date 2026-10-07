const express = require('express');
const { body } = require('express-validator');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { validar, idParam } = require('../middleware/validar');
const c = require('../controllers/productosController');

const router = express.Router();

const reglas = (opcional) => {
  const o = (r) => (opcional ? r.optional() : r);
  return [
    o(body('nombre').isString().trim().isLength({ min: 2, max: 120 })),
    o(body('precio_unitario').isFloat({ min: 0, max: 100000 }).withMessage('Precio inválido')),
    body('codigo_producto').optional({ values: 'null' }).isString().trim().isLength({ max: 20 }),
    body('id_categoria').optional({ values: 'null' }).isInt({ min: 1 }),
    body('descripcion').optional({ values: 'null' }).isString().trim().isLength({ max: 300 }),
    body('unidad_medida').optional({ values: 'null' }).isString().trim().isLength({ max: 20 }),
    body('stock_disponible').optional({ values: 'null' }).isInt({ min: 0, max: 1000000 }),
    body('activo').optional().isBoolean(),
  ];
};

router.get('/', verificarToken, c.getProductos);
router.get('/categorias', verificarToken, c.getCategorias);
router.get('/:id', verificarToken, idParam, c.getProductoById);
router.post('/', verificarToken, soloAdmin, validar(reglas(false)), c.crearProducto);
router.put('/:id', verificarToken, soloAdmin, idParam, validar(reglas(true)), c.actualizarProducto);

module.exports = router;
