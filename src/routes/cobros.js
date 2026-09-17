const express = require('express');
const router = express.Router();
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { getCobros, getCobroById, crearCobro, actualizarCobro } = require('../controllers/cobrosController');

router.get('/', verificarToken, getCobros);
router.get('/:id', verificarToken, getCobroById);
router.post('/', verificarToken, crearCobro);
router.put('/:id', verificarToken, soloAdmin, actualizarCobro);

module.exports = router;