const express = require('express');
const router = express.Router();
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { getProductos, getProductoById, crearProducto, actualizarProducto } = require('../controllers/productosController');

router.get('/', verificarToken, getProductos);
router.get('/:id', verificarToken, getProductoById);
router.post('/', verificarToken, soloAdmin, crearProducto);
router.put('/:id', verificarToken, soloAdmin, actualizarProducto);

module.exports = router;