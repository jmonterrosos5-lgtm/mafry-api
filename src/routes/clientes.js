const express = require('express');
const router = express.Router();
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { getClientes, getClienteById, crearCliente, actualizarCliente } = require('../controllers/clientesController');

router.get('/', verificarToken, getClientes);
router.get('/:id', verificarToken, getClienteById);
router.post('/', verificarToken, crearCliente);
router.put('/:id', verificarToken, soloAdmin, actualizarCliente);

module.exports = router;
