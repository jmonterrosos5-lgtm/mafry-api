const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth');
const { getVisitas, getVisitaById, crearVisita, actualizarVisita } = require('../controllers/visitasController');
router.get('/', verificarToken, getVisitas);
router.get('/:id', verificarToken, getVisitaById);
router.post('/', verificarToken, crearVisita);
router.put('/:id', verificarToken, actualizarVisita);
module.exports = router;
