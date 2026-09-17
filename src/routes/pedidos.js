const express = require('express');
const router = express.Router();
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { getPedidos, getPedidoById, crearPedido, actualizarEstadoPedido } = require('../controllers/pedidosController');
router.get('/', verificarToken, getPedidos);
router.get('/:id', verificarToken, getPedidoById);
router.post('/', verificarToken, crearPedido);
router.put('/:id', verificarToken, actualizarEstadoPedido);
module.exports = router;
