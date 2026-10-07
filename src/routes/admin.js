const express = require('express');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const c = require('../controllers/dashboardController');

const router = express.Router();
router.use(verificarToken, soloAdmin);
router.get('/dashboard', c.resumen);
router.get('/bitacora', c.bitacora);

module.exports = router;
