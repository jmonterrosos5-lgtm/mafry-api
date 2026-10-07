const { validationResult, param } = require('express-validator');

// Ejecuta las reglas de express-validator y responde 400 con los campos inválidos.
// No se devuelve el valor enviado, solo el campo y el motivo.
const validar = (reglas) => [
  ...reglas,
  (req, res, next) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        campos: errores.array().map((e) => ({ campo: e.path, mensaje: e.msg })),
      });
    }
    next();
  },
];

const idParam = validar([param('id').isInt({ min: 1 }).withMessage('Debe ser un entero positivo').toInt()]);

module.exports = { validar, idParam };
