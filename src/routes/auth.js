const express = require('express');
const { body } = require('express-validator');
const c = require('../controllers/authController');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { limiteLogin } = require('../middleware/rateLimit');
const { validar } = require('../middleware/validar');
const { reglaContrasena } = require('../utils/politicas');

const router = express.Router();

router.post('/login', limiteLogin, validar([
  body('correo').isEmail().withMessage('Correo inválido').isLength({ max: 120 }).normalizeEmail({ gmail_remove_dots: false }),
  body('contrasena').isString().isLength({ min: 1, max: 72 }).withMessage('Contraseña requerida'),
]), c.login);

// Paso 2 del login cuando la cuenta tiene verificación en dos pasos (MFA)
const codigoMfa = body('codigo').matches(/^\d{6}$/).withMessage('Código de 6 dígitos');
router.post('/mfa/verificar', limiteLogin, validar([
  body('token_mfa').isJWT().withMessage('Token requerido'),
  codigoMfa,
]), c.verificarMfa);

router.post('/logout', verificarToken, c.logout);
router.get('/perfil', verificarToken, c.perfil);

router.post('/cambiar-contrasena', verificarToken, validar([
  body('actual').isString().notEmpty().withMessage('Requerida'),
  reglaContrasena('nueva'),
]), c.cambiarContrasena);

// Configuración del MFA: obligatorio por política para administradores.
router.post('/mfa/configurar', verificarToken, soloAdmin, c.configurarMfa);
router.post('/mfa/activar', verificarToken, soloAdmin, validar([codigoMfa]), c.activarMfa);
router.post('/mfa/desactivar', verificarToken, soloAdmin, limiteLogin, validar([
  body('contrasena').isString().isLength({ min: 1, max: 72 }),
  codigoMfa,
]), c.desactivarMfa);

module.exports = router;
