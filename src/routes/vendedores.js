const express = require('express');
const router = express.Router();
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { getVendedores, getVendedorById, actualizarVendedor } = require('../controllers/vendedoresController');

router.get('/', verificarToken, soloAdmin, getVendedores);
router.get('/:id', verificarToken, soloAdmin, getVendedorById);
router.put('/:id', verificarToken, soloAdmin, actualizarVendedor);

module.exports = router;