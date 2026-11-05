const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const mensaje = (texto) => ({ error: texto });

// Límite general para toda la API (protege disponibilidad ante abuso).
// RATE_LIMIT_GENERAL permite subir el límite SOLO en el ambiente de QA durante la prueba de carga
// (k6 envía todo desde una sola IP); en producción queda en 300 solicitudes / 15 min por IP.
const limiteGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 10000 : env.RATE_LIMIT_GENERAL,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: mensaje('Demasiadas solicitudes, intente más tarde'),
});

// Límite estricto para el login (fuerza bruta / credential stuffing).
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? Number(process.env.TEST_LOGIN_LIMIT || 1000) : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: mensaje('Demasiados intentos de inicio de sesión, espere 15 minutos'),
});

module.exports = { limiteGeneral, limiteLogin };
