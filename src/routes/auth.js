const express = require('express');
const { body } = require('express-validator');
const { login, perfil, cambiarContrasena } = require('../controllers/authController');
const { verificarToken } = require('../middleware/auth');
const { limiteLogin } = require('../middleware/rateLimit');
const { validar } = require('../middleware/validar');
const { reglaContrasena } = require('../utils/politicas');

const router = express.Router();

router.post('/login', limiteLogin, validar([
  body('correo').isEmail().withMessage('Correo inválido').isLength({ max: 120 }).normalizeEmail({ gmail_remove_dots: false }),
  body('contrasena').isString().isLength({ min: 1, max: 72 }).withMessage('Contraseña requerida'),
]), login);

router.get('/perfil', verificarToken, perfil);

router.post('/cambiar-contrasena', verificarToken, validar([
  body('actual').isString().notEmpty().withMessage('Requerida'),
  reglaContrasena('nueva'),
]), cambiarContrasena);

module.exports = router;
