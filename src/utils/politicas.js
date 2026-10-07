const { body } = require('express-validator');

// Política de contraseñas: mínimo 10 caracteres, al menos una letra y un número.
const reglaContrasena = (campo) =>
  body(campo)
    .isString()
    .isLength({ min: 10, max: 72 }) // bcrypt solo usa los primeros 72 bytes
    .withMessage('Debe tener entre 10 y 72 caracteres')
    .matches(/[A-Za-z]/)
    .withMessage('Debe incluir al menos una letra')
    .matches(/\d/)
    .withMessage('Debe incluir al menos un número');

module.exports = { reglaContrasena };
